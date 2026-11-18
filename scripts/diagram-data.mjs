// diagram-studio/1 data: loaded by name, never hand-built nodes in the component.
export const diagram = {
  id: 'workload-cert-mtls',
  format: 'diagram-studio/1',
  nodes: [
    { id: 'ca', label: 'Trust-domain CA', sub: 'corp.example.com root' },
    { id: 'client', label: 'Client workload', sub: 'spiffe://corp.example.com/orders' },
    { id: 'server', label: 'Server workload', sub: 'spiffe://corp.example.com/billing' },
  ],
  edges: [
    { id: 'e1', from: 'ca', to: 'client', label: 'signed SVID' },
    { id: 'e2', from: 'ca', to: 'server', label: 'signed SVID' },
    { id: 'e3', from: 'client', to: 'server', label: 'mTLS both ways' },
  ],
};
