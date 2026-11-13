const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { View, Text } = require("react-native-web");

function render(name, data, error = false) {
  const file = "src/features/account/ClubMembership.tsx";
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  );
  const source = ts.transpileModule(
    fn.getText(ast).replace(/^export /, "") + `\nexports.Component = ${name};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const label = ({ label, message, title }) =>
    React.createElement(Text, null, label || message || title);
  const context = {
    exports: {},
    require,
    View,
    Text,
    useState: React.useState,
    useAuth: () => ({ customer: { id: "owner" } }),
    useTheme: () => ({ colors: {} }),
    useQueryClient: () => ({ invalidateQueries: async () => {} }),
    useQuery: () => ({ data, isError: error, isPending: false }),
    useMutation: () => ({}),
    clubApi: {},
    z: require("zod").z,
    Ionicons: () => null,
    Button: label,
    Notice: label,
    Input: label,
    OccasionDateField: label,
    Disclosure: label,
    money: (v) => `KES ${v}`,
    Date,
  };
  vm.runInNewContext(source, context);
  return renderToStaticMarkup(React.createElement(context.exports.Component));
}

test("Club dates show readable calendar cards and keep the add form out of the saved date list", () => {
  const html = render("Celebrations", [
    {
      id: "1",
      name: "Mum",
      occasion: "birthday",
      month: 12,
      day: 18,
      notes: "",
    },
  ]);
  assert.match(html, /Mum/);
  assert.match(html, /DEC/);
  assert.match(html, /Remind me/);
  assert.match(html, /Manage/);
  assert.match(html, /Add a celebration/);
  assert.doesNotMatch(html, /Save date|Their name/);
  assert.match(render("Celebrations", null, true), /Your dates could not load/);
});

test("Club perks separate referral and birthday summaries and leave full rules on demand", () => {
  const html = render("MembershipBenefits", {
    referral_code: "CC-PRIVATE",
    referral_points: 50,
    referrals_completed: 2,
    referral_minimum_kes: 2000,
    referral_annual_limit: 10,
    referral_status: null,
    birthday: null,
    birthday_claimed: false,
  });
  assert.match(html, /Bring a friend/);
  assert.match(html, /50 points/);
  assert.match(html, /Share my invite/);
  assert.match(html, /A birthday treat/);
  assert.match(html, /Birthday benefit details/);
  assert.doesNotMatch(html, /Claim once a year/);
});
