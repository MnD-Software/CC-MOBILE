import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Use 80 characters or fewer.")
  .refine(
    (value) => !/[\p{C}]/u.test(value),
    "Enter a name without control characters.",
  );
export const profileInputSchema = z
  .object({
    first_name: name,
    last_name: name,
    phone: z
      .string()
      .trim()
      .nullable()
      .transform((value) => value?.replace(/\s/g, "") || null)
      .refine(
        (value) => value === null || /^(?:\+?254|0)[17][0-9]{8}$/.test(value),
        "Enter a Kenyan phone number such as 0712345678, or leave it blank.",
      ),
  })
  .strict();
