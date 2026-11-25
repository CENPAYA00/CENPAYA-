export const policies = {
  termsOfService: {
    title: "Terms of Service",
    bodyMarkdown: "PASTE TERMS OF SERVICE TEXT HERE",
  },
  securityPatchPolicy: {
    title: "Security Patch Policy",
    bodyMarkdown: "PASTE SECURITY PATCH POLICY TEXT HERE",
  },
  refundPolicy: {
    title: "Refund Policy",
    bodyMarkdown: "PASTE REFUND POLICY TEXT HERE",
  },
  subscriptionTerms: {
    title: "Subscription Terms",
    bodyMarkdown: "PASTE SUBSCRIPTION TERMS HERE",
  },
} as const;

export type PolicyKey = keyof typeof policies;
