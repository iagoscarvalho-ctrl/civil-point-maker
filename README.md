# Estaqueamento automático

Eu tenho um estaqueamento onde temos a seguinte situação:
- Dois pontos nas extremidades onde possui os "pvs", sendo que, é um ponto 3D que possui um texto estruturado da seguinte forma: Nome, elevação e descrição. Preciso que pegue o nome e deixe alinhado com o mesmo tamanho do texto como exemplo, ao lado e com o layer diferente do PV.
- Depois possui uma polyline onde ela sai do ponto mais baixo para o mais alto em relação a levação (jusante para montante)  onde é inserido um bloco (seta) no sentido inverso, porque precisa que o sentido da seta seja (montante para jusante), precisa inserir o tamanho total da polylinha ao lado desse bloco, conforme exemplo.
- em torno da polylinha, eu preciso gerar pontos (estaqueamento) de 20 em 20 metros até chegar no PV. Esse ponto precisa ter um texto com o numero do estaqueramento, seja ele inteiro ou não, ao lado do ponto, conforme exmplo.

olhando o exemplo enviado, gostaria que gerasse esse padrão onde eu irei entrar com um arquivo DXF com a polylinha e os pontos das extremidades, conforme o exemplo e você irá inserir, o estaqueramento com pontos 3D e sua respectiva numeração, o bloco em torno da polylinha conforme falado, a distância total da polylinha e os textos dos pvs.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4cce28a0-7478-49a5-a914-c2b29710189a).

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
