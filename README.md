# Motormac Hub - Central de Compras

Atue como um desenvolvedor Full Stack especialista em React, Tailwind CSS e Supabase. Preciso criar uma plataforma centralizada de Checklists e Solicitações Internas com a identidade visual da empresa.

A aplicação deve ter uma interface moderna, limpa, profissional e responsiva.

### 1. Identidade Visual e Layout Global

- Crie um componente de Layout Global (como uma Topbar ou Sidebar) que persista em todas as páginas da plataforma.

- No canto superior esquerdo desse layout, inclua o Logotipo da Empresa. 

- No código React, configure a tag de imagem da logo apontando para o caminho relativo público: src="/logo-motormac.png"

- Use classes do Tailwind para garantir que a imagem tenha um tamanho fixo elegante (ex: h-10 ou h-12) e mantenha a proporção.

- (Nota: O arquivo físico da logo será dropado na pasta public do projeto posteriormente).

### 2. Estrutura Principal (Dashboard / Unidade Centralizada)

- Tela inicial com um layout de "Hub" ou "Dashboard".

- Apresentar 3 cards ou botões principais em destaque para o solicitante escolher o tipo de requisição:

  1. Solicitação de Compra do Módulo de Peças

  2. Cadastro ou Renovação de Contratos

  3. Solicitação de Frete

### 3. Formulários e Modelos de Checklist

Ao clicar em cada card, o usuário deve ser direcionado para o respectivo formulário:

#### Opção 1: Solicitação de Compra do Módulo de Peças

Criar um formulário detalhado contendo exatamente os seguintes campos e regras:

1. Nome (*Obrigatório) - Input de texto

2. E-mail (*Obrigatório) - Input de e-mail com validação

3. Telefone (DDD + número) (*Obrigatório) - Input com máscara de telefone

4. CNPJ da unidade pagadora da peça (*Obrigatório) - Input formatado (CNPJ)

5. Qual peça precisa ser comprada? (*Obrigatório) - Input de texto

6. Para qual operação você está solicitando esta peça? (Opcional) - Seleção única (Radio/Dropdown):

   - Oficina Cummins

   - Oficina JCB

   - Balcão de Vendas de peças Cummins

   - Balcão de Vendas de Peças JCB

   - Outra

7. Qual é a unidade responsável pela compra? (Opcional) - Seleção única (Radio/Dropdown):

   - Porto Alegre/RS

   - Passo Fundo/RS

   - São Gabriel/RS

   - São José/SC

   - Chapecó/SC

   - Colombo/PR

   - Maringá/PR

   - Outra

8. Especificação técnica da peça (*Obrigatório) - Textarea (campo de texto longo)

9. Número da Ordem de Serviço (Opcional, nota explicativa: "quando for peça de balcão, inserir número do contato da providência") - Input de texto

10. Envio de arquivos (*Obrigatório, nota explicativa: "Envie foto, ficha técnica do equipamento para que o comprador possa ter informações complementares na solicitação aos fornecedores") - Componente de upload (Permitir até 5 arquivos, limite 100MB cada, formatos: Word, Excel, PPT, PDF, Imagem, Vídeo, Áudio)

11. Lista de Part Numbers (PN) (Opcional) - Textarea para listar os Part Numbers das peças solicitadas

12. Para qual data a peça é esperada? (*Obrigatório) - Input tipo Date

#### Opção 2: Cadastro ou Renovação de Contratos

Criar um formulário detalhado contendo exatamente os seguintes campos e regras:

1. Nome (*Obrigatório) - Input de texto

2. E-mail (*Obrigatório) - Input de e-mail com validação

3. Telefone (Opcional) - Input de texto

4. Unidade de relação contratual (*Obrigatório) - Campo de seleção única (Radio/Dropdown):

   - Porto Alegre/RS

   - Passo Fundo/RS

   - São Gabriel/RS

   - São José/SC

   - Chapecó/SC

   - Colombo/PR

   - Maringá/PR

5. Empresa da relação do contrato (*Obrigatório) - Campo de seleção única (Radio/Dropdown):

   - Distribuidora Meridional de Motores Cummins LTDA (DMMC)

   - NEST Inovação em energia (NEST)

   - Motormac Administração e Locação de Bens (MALB)

   - SV Parts

6. Objeto do Contrato (em resumo) (*Obrigatório) - Textarea

7. Tipo de solicitação (*Obrigatório) - Campo de seleção única (Radio):

   - Cadastro de contrato novo

   - Inclusão de aditivo de renovação de contrato

   - Retificação de saldo de contrato

8. Número do contrato anterior (Opcional, nota explicativa: "Para Inclusão de aditivo ou Retificação de saldo, informar o número do contrato existente é obrigatório") - Input de texto

9. CNPJ do fornecedor do contrato (Opcional) - Input formatado (CNPJ)

10. Razão social do fornecedor (*Obrigatório, nota: "não será validado o nome fantasia") - Input de texto

11. O processo de cotação possui validação do gestor da área? (*Obrigatório) - Seleção (Sim / Não)

12. Nome do gestor responsável pelo contrato (*Obrigatório) - Input de texto

13. O contrato foi validado junto à área jurídica da empresa, ou segue o modelo de contrato padrão Motormac? (*Obrigatório) - Seleção (Sim / Não / Talvez, não sei)

14. Upload do Contrato Assinado (*Obrigatório, nota: "O contrato deve possuir assinatura da CONTRATADA e da CONTRATANTE. Assinaturas digitais devem ser certificadas") - Componente de upload de arquivo (Permitir até 2 arquivos, limite 100MB cada, formatos: PDF, Word, Imagem)

15. Validação do Financeiro (Opcional, nota: "O fornecedor foi validado pelo financeiro e está cadastrado no sistema? Anexe a validação.") - Componente de upload de arquivo (Permitir 1 arquivo, limite 10MB)

16. Duração do contrato - Data de início (*Obrigatório) - Input tipo Date

17. Duração do contrato - Data de término (*Obrigatório) - Input tipo Date

18. Valor mensal do contrato (*Obrigatório, nota: "Em reais ou dólares. Valores em dólares serão convertidos pela cotação do dia do lançamento no Apollo") - Input numérico/moeda

19. Valor total do contrato (*Obrigatório, nota: "Em reais ou dólares. Valores em dólares serão convertidos pela cotação do dia do lançamento no Apollo") - Input numérico/moeda

20. Termo de Ciência e Declaração (*Obrigatório) - Checkbox com o texto: "DECLARO que as informações inseridas nesta solicitação sobre o contrato são verídicas. Tenho ciência de que o não preenchimento de informações obrigatórias ou inconsistências poderão acarretar no indeferimento do pedido." (Opção para marcar: "De acordo.")

#### Opção 3: Solicitação de Frete

Criar um formulário contendo exatamente os seguintes campos:

- CNPJ do pagador do frete (Input formatado)

- CNPJ do remetente (Input formatado)

- CNPJ do destinatário (Input formatado)

- Cidade de origem

- CEP de origem (Input formatado)

- Cidade de destino

- CEP de destino (Input formatado)

- Valor total da Nota Fiscal (Input tipo moeda R$)

- Peso bruto (Input numérico)

- Número de volumes (Input numérico)

- Dimensões das embalagens (Altura x Largura x Comprimento)

- Tipo de produto (Dropdown ou campo de texto)

### 4. Funcionalidades de UX e Comportamento

- Botão de "Voltar" visível em cada formulário para retornar facilmente ao Dashboard central.

- Validação estrita de todos os campos marcados com (*Obrigatório) antes de permitir o envio dos formulários.

- Feedback visual claro de "Solicitação enviada com sucesso!" usando um Toast ou Modal de confirmação após o envio.

- Criar uma aba ou tela simples de "Histórico de Solicitações" onde o usuário possa acompanhar uma lista simulada das requisições já feitas.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://centralcomprasmotormac.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ceaa1567-f07b-4c60-9192-d42ba804cd23).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
