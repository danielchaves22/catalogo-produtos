import forge from 'node-forge';

type CertBag = { cert: forge.pki.Certificate };

export type ParsedPkcs12 = {
  privateKeyPem: string;
  certificatePem: string;
  caCertificatesPem: string[];
  friendlyName?: string;
};

/**
 * Parse a PKCS#12/PFX buffer and return PEM-encoded materials.
 * @param pfx Buffer or Uint8Array with .p12/.pfx bytes
 * @param password Password used to protect the PFX
 */
export function parsePkcs12(pfx: Buffer | Uint8Array, password: string): ParsedPkcs12 {
  // Convert Node Buffer/Uint8Array to forge binary buffer
  const nodeBuf = Buffer.isBuffer(pfx) ? pfx : Buffer.from(pfx);
  // Build a forge ByteBuffer from DER bytes; use latin1 to keep raw bytes
  const der = forge.util.createBuffer(nodeBuf.toString('latin1'), 'raw');
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  // Extract key bag (pkcs8ShroudedKeyBag or keyBag)
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || [];
  const rawKeyBag = keyBags[0] || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!rawKeyBag || !rawKeyBag.key) {
    throw new Error('Private key not found in PFX');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(rawKeyBag.key as forge.pki.PrivateKey);

  // Extract all certificates
  const allCertBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []) as forge.pkcs12.Bag[];
  if (!allCertBags.length) {
    throw new Error('Certificate not found in PFX');
  }

  // Attempt to find the leaf certificate that matches the private key
  const key = rawKeyBag.key as forge.pki.rsa.PrivateKey;
  const matchesKey = (cert: forge.pki.Certificate): boolean => {
    try {
      const pub = cert.publicKey as forge.pki.rsa.PublicKey;
      // Compare modulus and exponent when RSA
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (key as any).n && pub.n && key.n.compareTo(pub.n) === 0 && key.e && pub.e && key.e.compareTo(pub.e) === 0;
    } catch {
      return false;
    }
  };

  const allCerts = allCertBags
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);

  let leafCert = allCerts.find(matchesKey);
  if (!leafCert) {
    // Fallback to first cert
    leafCert = allCerts[0];
  }

  const certificatePem = forge.pki.certificateToPem(leafCert);

  // CA chain = remaining certs (not equal to leaf)
  const caCertificatesPem = allCerts
    .filter((c) => c !== leafCert)
    .map((c) => forge.pki.certificateToPem(c));

  // Try to read a friendly name if present
  let friendlyName: string | undefined;
  const attrs = (rawKeyBag.attributes || []) as Array<{ name?: string; value?: string; type?: string; }>; 
  const fnAttr = attrs.find((a: { name?: string; value?: string; type?: string }) => a.name === 'friendlyName');
  if (fnAttr && typeof fnAttr.value === 'string') friendlyName = fnAttr.value;

  return { privateKeyPem, certificatePem, caCertificatesPem, friendlyName };
}

/**
 * Helper to parse from a Base64 string (e.g., when uploading via JSON).
 */
export function parsePkcs12Base64(b64: string, password: string): ParsedPkcs12 {
  const buf = Buffer.from(b64, 'base64');
  return parsePkcs12(buf, password);
}
