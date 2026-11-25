export type SupportCategory = {
  group: string;
  items: string[];
};

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    group: 'Payments',
    items: [
      'Escrow Scam',
      'Payment Failed',
      'Refund Not Received',
      'Wallet Balance Issue',
      'Withdrawal Delayed',
      'Double Charge',
    ],
  },
  {
    group: 'Account',
    items: [
      'Cannot Login',
      'Account Suspended',
      'Verification Failed',
      'Password Reset Issue',
      'Email Not Recognized',
    ],
  },
  {
    group: 'Orders & Listings',
    items: [
      'Seller Not Responding',
      'Item Not As Described',
      'Order Not Delivered',
      'Listing Removed Wrongly',
    ],
  },
  {
    group: 'Safety',
    items: [
      'Harassment',
      'Fake Profile',
      'Spam or Scam',
      'Underage User',
      'Violence or Threats',
    ],
  },
  {
    group: 'App',
    items: [
      'Bug Report',
      'Feature Request',
      'Performance Issue',
      'Other',
    ],
  },
];

export const ALL_SUPPORT_CATEGORIES = SUPPORT_CATEGORIES.flatMap(g =>
  g.items.map(i => ({ value: i, label: i, sub: g.group }))
);
