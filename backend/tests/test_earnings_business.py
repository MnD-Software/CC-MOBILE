from datetime import UTC, datetime
from io import BytesIO
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from sqlalchemy.orm import Session
from test_pesapal import system
from test_logistics import delivery, actor, assign, trip, ready, progress
from app.models import Customer
from app.main import app
from app.business import TEAM


def test_rider_fare_partial_payments_and_report_are_scoped(delivery):
    s = delivery
    assign(s)
    task = trip(s)
    path = '/v1/rider-earnings/' + task['id']
    actor()
    assert s['client'].put(path+'/estimate', json={'distance_meters': 10000}).json()['amount_minor'] == 23500
    actor('rider', 'rider')
    assert s['client'].get('/v1/rider-earnings').json()['trips'][0]['amount_minor'] == 23500
    assert s['client'].put(path+'/estimate', json={'distance_meters': 1000}).status_code == 403
    actor('other-rider', 'rider')
    assert s['client'].get('/v1/rider-earnings').json()['trips'] == []
    actor('branch', 'branch_manager')
    assert s['client'].post(path+'/approve').status_code == 403
    actor()
    assert s['client'].post(path+'/approve').status_code == 409
    task = progress(s, task, 'accepted')
    ready(s)
    for state in ['collected', 'in_transit', 'delivered']:
        task = progress(s, task, state, proof='Received by customer')
    actor()
    assert s['client'].post(path+'/approve').json()['balance_minor'] == 23500
    payment = {'request_key':'payment-request-key-123', 'amount_minor':10000, 'reference':'MPESA-TEST-1', 'paid_at':datetime.now(UTC).isoformat()}
    assert s['client'].post(path+'/payments',json=payment).json()['balance_minor'] == 13500
    assert s['client'].post(path+'/payments',json=payment).json()['paid_minor'] == 10000
    assert s['client'].post(path+'/payments',json={**payment,'request_key':'payment-request-key-124','amount_minor':20000,'reference':'MPESA-TEST-2'}).status_code == 409
    assert s['client'].put(path+'/estimate',json={'distance_meters':5000}).status_code == 409
    result=s['client'].get('/v1/rider-earnings/report.xlsx')
    assert result.status_code == 200
    with ZipFile(BytesIO(result.content)) as z:
        assert z.testzip() is None
        for filename in z.namelist(): ET.fromstring(z.read(filename))
        assert b'235' in z.read('xl/worksheets/sheet1.xml')
    actor('buyer','customer')
    assert s['client'].get('/v1/rider-earnings/report.xlsx').status_code == 403


def test_corporate_onboarding_crm_documents_and_client_isolation(system):
    s=system
    actor()
    body={'request_key':'client-onboard-key-123','name':'Acme Team','billing_address':'Nairobi Office','industry':'Services','email':'client@acme.example','first_name':'Corporate','last_name':'Buyer','password':'Local-test-password-123'}
    created=s['client'].post('/v1/business/companies',json=body)
    assert created.status_code == 201,created.text
    identity=created.json()['id']
    assert s['client'].post('/v1/business/companies',json=body).json()['id'] == identity
    root='/v1/business/companies/'+identity
    with Session(s['engine']) as db:
        client=db.query(Customer).filter(Customer.email=='client@acme.example').one()
        client_id=client.id
    quote=s['client'].post(root+'/documents',json={'request_key':'quotation-key-12345','kind':'quote','lines':[{'product_id':12,'quantity':2}]}).json()
    assert quote['total_minor']==500000 and quote['status']=='issued'
    assert s['client'].post(root+'/activities',json={'stage':'proposal','note':'Sent celebration quote'}).status_code==201
    actor('other','customer')
    assert s['client'].get(root).status_code==404
    actor(client_id,'corporate_client')
    assert s['client'].get(root).json()['activities']==[]
    lpo=s['client'].post(root+'/documents',json={'request_key':'client-lpo-reference-123','kind':'lpo','linked_id':quote['id'],'reference':'PO-123'}).json()
    import base64
    evidence={'mime':'application/pdf','data':base64.b64encode(b'%PDF-1.4 test evidence').decode()}
    evidence_path=root+'/documents/'+lpo['id']+'/attachment'
    assert s['client'].put(evidence_path,json=evidence).status_code==200
    assert s['client'].get(evidence_path).content.startswith(b'%PDF-')
    actor('other','customer')
    assert s['client'].get(evidence_path).status_code==404
    actor(client_id,'corporate_client')
    assert s['client'].post(root+'/activities',json={'stage':'won','note':'Forbidden staff note'}).status_code==403
    result=s['client'].post(root+'/documents/'+quote['id']+'/status',json={'revision':1,'status':'accepted'})
    assert result.status_code==200,result.text
    assert s['client'].post(root+'/documents',json={'request_key':'invoice-client-forbidden','kind':'invoice','linked_id':quote['id']}).status_code==403
    actor()
    invoice=s['client'].post(root+'/documents',json={'request_key':'invoice-document-key-123','kind':'invoice','linked_id':quote['id']}).json()
    actor(client_id,'corporate_client')
    payment=s['client'].post(root+'/documents',json={'request_key':'payment-evidence-key-123','kind':'payment','linked_id':invoice['id'],'reference':'TX-REF-1','amount_minor':200000}).json()
    assert s['client'].get(root).json()['totals']['paid_minor']==0
    assert s['client'].post(root+'/documents/'+payment['id']+'/status',json={'revision':1,'status':'verified'}).status_code==403
    actor()
    assert s['client'].post(root+'/documents/'+payment['id']+'/status',json={'revision':1,'status':'verified'}).status_code==200
    assert s['client'].get(root).json()['totals']['balance_minor']==300000
    html=s['client'].get(root+'/documents/'+invoice['id']+'/print')
    assert html.status_code==200 and 'Acme Team' in html.text


def test_customer_tracking_includes_each_assigned_rider_without_private_account_data(delivery):
    s=delivery
    assign(s)
    task=trip(s)
    actor('buyer','customer')
    detail=s['client'].get('/v1/app-orders/'+s['reference'])
    assert detail.status_code==200
    rider=detail.json()['deliveries'][0]['rider']
    assert rider=={'name':'rider Test','phone':'0712345678','role':'rider'}
    assert 'password' not in str(rider) and 'email' not in rider
    actor('other','customer')
    assert s['client'].get('/v1/app-orders/'+s['reference']).status_code==404


def test_xlsx_text_is_not_a_formula():
    from app.excel_report import workbook_response
    result=workbook_response('safe',['Reference'],[['=HYPERLINK("bad")'],['<tag>']])
    with ZipFile(BytesIO(result.body)) as z:
        xml=z.read('xl/worksheets/sheet1.xml')
        assert b'<f>' not in xml and b'inlineStr' in xml and b'&lt;tag&gt;' in xml
