import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { processDxf, type ProcessResult } from "@/lib/dxf-processor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estaqueamento DXF — Gerador automático" },
      {
        name: "description",
        content:
          "Processa DXF com PVs e polyline de eixo para gerar estaqueamento, seta de fluxo, textos dos PVs e comprimento total.",
      },
      { property: "og:title", content: "Estaqueamento DXF" },
      {
        property: "og:description",
        content: "Gere estaqueamento, seta e textos automaticamente a partir do seu DXF.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [spacing, setSpacing] = useState(20);
  const [hPV, setHPV] = useState(1.4);
  const [hStake, setHStake] = useState(0.5);
  const [hRede, setHRede] = useState(1.4);
  const [arrowScale, setArrowScale] = useState(1);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const r = processDxf(text, {
        spacing,
        textHeightPV: hPV,
        textHeightStake: hStake,
        textHeightRede: hRede,
        arrowScale,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.dxf$/i, "") + "_estaqueado.dxf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Engenharia · DXF
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Estaqueamento automático
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Carregue um DXF contendo os dois PVs (POINT 3D no layer{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">PV</code>) e a polyline do
            eixo (layer{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ELEVACAO_05_LINHA_EIXO</code>
            ). O processador adiciona estacas a cada {spacing} m, seta de fluxo, nome dos PVs e o
            comprimento total da rede.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="spacing">Espaçamento das estacas (m)</Label>
              <Input
                id="spacing"
                type="number"
                step="0.1"
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hpv">Altura texto PV</Label>
              <Input
                id="hpv"
                type="number"
                step="0.1"
                value={hPV}
                onChange={(e) => setHPV(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hst">Altura texto estaca</Label>
              <Input
                id="hst"
                type="number"
                step="0.1"
                value={hStake}
                onChange={(e) => setHStake(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hre">Altura texto comprimento</Label>
              <Input
                id="hre"
                type="number"
                step="0.1"
                value={hRede}
                onChange={(e) => setHRede(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asc">Escala do bloco seta</Label>
              <Input
                id="asc"
                type="number"
                step="0.1"
                value={arrowScale}
                onChange={(e) => setArrowScale(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <label
            htmlFor="dxf"
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:bg-accent"
          >
            <span className="text-base font-semibold text-foreground">
              {fileName || "Selecionar arquivo DXF"}
            </span>
            <span className="mt-1 text-sm text-muted-foreground">
              Clique para escolher um arquivo
            </span>
            <input
              id="dxf"
              type="file"
              accept=".dxf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        </div>

        {busy && <p className="mt-4 text-sm text-muted-foreground">Processando…</p>}

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Polylines processadas</dt>
                <dd className="font-mono text-foreground">{result.summary.polylineCount}</dd>
                <dt className="text-muted-foreground">Estacas geradas</dt>
                <dd className="font-mono text-foreground">
                  {result.summary.totalStakes} (a cada {result.summary.stakeSpacing} m)
                </dd>
                <dt className="text-muted-foreground">Triangulação</dt>
                <dd className="font-mono text-foreground">
                  {result.summary.tinTriangles > 0
                    ? `${result.summary.stakesFromTin}/${result.summary.totalStakes} interpoladas no TIN (${result.summary.tinTriangles} triângulos)`
                    : "não encontrada — Z linear entre PVs"}
                </dd>
              </dl>
              <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Jusante</th>
                      <th className="px-3 py-2">Montante</th>
                      <th className="px-3 py-2 text-right">Comprimento</th>
                      <th className="px-3 py-2 text-right">Estacas</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {result.summary.polylines.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          {p.pvA.name} ({p.pvA.elev.toFixed(2)})
                        </td>
                        <td className="px-3 py-2">
                          {p.pvB.name} ({p.pvB.elev.toFixed(2)})
                        </td>
                        <td className="px-3 py-2 text-right">{p.length.toFixed(2)} m</td>
                        <td className="px-3 py-2 text-right">{p.stakes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={download} className="w-full">
                Baixar DXF processado
              </Button>
            </CardContent>
          </Card>
        )}

        <footer className="mt-10 text-xs text-muted-foreground">
          Layers de saída:{" "}
          <code className="rounded bg-muted px-1 py-0.5">ELEVACAO_00_ESTACAS</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">ELEVACAO_19_TEXTO_PVS</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">ELEVACAO_19_TEXTO_REDE</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">ELEVACAO_34_SETA_FLUXO</code>. O bloco{" "}
          <code className="rounded bg-muted px-1 py-0.5">seta</code> deve estar definido no DXF de
          entrada (template do projeto).
        </footer>
      </div>
    </div>
  );
}