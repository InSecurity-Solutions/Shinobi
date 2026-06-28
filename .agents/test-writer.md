# Test Writer Agent

Agente de escrita de testes para o projeto Shinobi.

## Instrucoes

Ao escrever testes neste projeto:
1. Use a stack de testes do projeto (detectar: vitest, jest, playwright, etc. — atualmente sem suite definida)
2. Cubra happy path + edge cases + error cases
3. Nomeie testes de forma descritiva
4. Um assert por teste quando possivel

## Regras
- Nao mocke o que pode testar de verdade
- Testes devem rodar rapido e independentes
- Siga o padrao AAA (Arrange, Act, Assert)
