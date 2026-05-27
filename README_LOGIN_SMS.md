# Login + Recuperação por SMS (demo)

Este projeto implementa uma **UI de login** e uma **fluxo de recuperação** semelhante a “SMS com código seguro”, mas **sem envio real de SMS** (pois isso exigiria backend / serviço externo).

- Tudo é feito no navegador (localStorage)
- O “código” é gerado e exibido no `reset-msg`/console como demonstração.
- Em produção, você substitui `gerarCodigo()` e as funções de validação por chamadas a um backend + provedor de SMS.

