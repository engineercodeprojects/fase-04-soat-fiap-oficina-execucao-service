import { AddressInfo } from 'net';
import { IncomingHttpHeaders, Server, createServer } from 'http';

export interface RequisicaoRecebida {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

/** Servidor HTTP fake (mock do OS Service): grava requisicoes e responde pela fila de respostas. */
export class ServidorHttpFake {
  readonly recebidas: RequisicaoRecebida[] = [];
  private respostas: { status: number; body?: unknown }[] = [];
  private server?: Server;
  url = '';

  responder(...respostas: { status: number; body?: unknown }[]): void {
    this.respostas.push(...respostas);
  }

  limpar(): void {
    this.recebidas.length = 0;
    this.respostas = [];
  }

  async iniciar(): Promise<void> {
    this.server = createServer((req, res) => {
      let dados = '';
      req.on('data', (c: Buffer) => (dados += c.toString()));
      req.on('end', () => {
        this.recebidas.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: dados ? JSON.parse(dados) : undefined,
        });
        const r = this.respostas.shift() ?? { status: 200 };
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(r.body === undefined ? '' : JSON.stringify(r.body));
      });
    });
    await new Promise<void>((ok) => this.server!.listen(0, '127.0.0.1', ok));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  async parar(): Promise<void> {
    await new Promise<void>((ok) => this.server?.close(() => ok()) ?? ok());
  }
}
