# 0010. Certificados Open Badges 3.0 assinados no KMS

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D10

## Contexto

Os certificados devem ser publicáveis e verificáveis por terceiros (LinkedIn, empregadores, clientes).

## Decisão

O `OpenBadgeCredential` (W3C VC 2.0) é emitido como VC-JWT ES256. A chave fica no KMS (`ECC_NIST_P256`) e o emissor é `did:web:escolagratisdetecnologia.com`. A revogação usa Bitstring Status List. Há página pública com Open Graph e botão do LinkedIn.

## Alternativas consideradas

- PDF com QR code: não verificável por máquina.
- Blockchain: custo e complexidade sem ganho para o público.

## Consequências

- Positivas:
  - Padrão aberto, chave privada nunca exposta e verificação por qualquer ferramenta compatível.
- Negativas:
  - A rotação de chaves exige manter as antigas no `did.json`.

## Pilares Well-Architected

Segurança e confiabilidade.

## Revisar quando

Houver mudança relevante no padrão Open Badges ou VC.
