# Armazenamento S3

O backend utiliza diferentes provedores de armazenamento conforme o ambiente definido em `APP_ENV`.

- **local**: usa o sistema de arquivos local.
- **hml** ou **prod**: utiliza o `S3StorageProvider` para enviar e recuperar arquivos de um bucket da AWS.

Para que o acesso ao S3 funcione nos ambientes de homologação e produção,
é necessário definir as seguintes variáveis de ambiente:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Sem essas credenciais o cliente S3 não é configurado, causando erro ao tentar salvar ou ler arquivos.

O bucket utilizado é `catprod-hml` quando `APP_ENV`=`hml` e `catprod-prd` quando `APP_ENV`=`prod`.
