/* Pure payment-details helpers (safe in client bundles). Loading from the database lives in payment.ts. */
export type PaymentDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  sortCode: string;
  instructions: string;
};

export const EMPTY_PAYMENT: PaymentDetails = { bankName: "", accountName: "", accountNumber: "", sortCode: "", instructions: "" };

export const DEFAULT_PAYMENT_INSTRUCTIONS = "Please quote the invoice number as the payment reference.";

/** Bank, account name and account number are all set. */
export const paymentConfigured = (p: PaymentDetails) => Boolean(p.bankName && p.accountName && p.accountNumber);

