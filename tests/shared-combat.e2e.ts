/** Live integration against the configured Supabase, using ONLY synthetic agents.
 * Writes fixture IDs to /tmp/fenix-combat-fixtures.json for scoped cleanup after the run.
 * FENIX_TEST_BROWSER=/path/to/chrome node --import tsx tests/shared-combat.e2e.ts
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { newAgent } from "../lib/rules";
import { rpc } from "../lib/share";

// This environment's browser lacks the proxy CA. curl validates HTTPS with the
// system trust store; these are real RPC responses, with no mocked backend data.
function relay(url: string, body: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const args = [
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      "--request",
      "POST",
      "--data-binary",
      "@-",
      "--write-out",
      "\n%{http_code}",
      url,
    ];
    for (const [key, value] of Object.entries(headers))
      args.push("--header", `${key}: ${value}`);
    const child = spawn("curl", args);
    let out = "",
      error = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => (error += data));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code) return reject(Error(error));
      const split = out.lastIndexOf("\n");
      resolve({
        status: Number(out.slice(split + 1)),
        body: out.slice(0, split),
      });
    });
    child.stdin.end(body);
  });
}
async function verify() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const result = await relay(
      String(url),
      String(init?.body || ""),
      init?.headers as Record<string, string>,
    );
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const campaignId = crypto.randomUUID(),
    a = newAgent("Principal de verificação"),
    b = newAgent("Expert de verificação"),
    face = newAgent("Parente de verificação");
  a.campaign_id = campaignId;
  a.nex = 65;
  a.resources.pv = 50;
  a.notes = "preservar ficha principal";
  face.nex = 35;
  face.resources.pv = 30;
  face.attributes.AGI = 2;
  face.skills.Iniciativa = 5;
  face.skillAdjustments = { Iniciativa: 3 };
  face.inventory = [
    {
      id: crypto.randomUUID(),
      name: "Vestimenta",
      kind: "Item",
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
      accessorySkill: "Iniciativa",
      accessoryBonus: 5,
      enhancements: [
        {
          id: crypto.randomUUID(),
          name: "Destreza",
          bookId: "01",
          subtype: "Maldição",
          notes: "",
        },
      ],
    },
  ];
  a.alternate = { approvedCampaignId: campaignId, face };
  b.campaign_id = campaignId;
  b.nex = 65;
  b.attributes.AGI = 0;
  b.skills.Iniciativa = 15;
  writeFileSync(
    "/tmp/fenix-combat-fixtures.json",
    JSON.stringify({ campaignId, agentIds: [a.id, b.id] }),
  );
  type Keys = { master_token: string; player_token: string };
  const ak = await rpc<Keys>("fenix_publish_agent", { agent_data: a }),
    bk = await rpc<Keys>("fenix_publish_agent", { agent_data: b });
  const browser = await chromium.launch({
    executablePath: process.env.FENIX_TEST_BROWSER || undefined,
    args: ["--no-sandbox"],
  });
  const base = process.env.FENIX_TEST_URL || "http://localhost:3000",
    errors: string[] = [];
  try {
    const masterContext = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      }),
      p1Context = await browser.newContext(),
      p2Context = await browser.newContext();
    for (const ctx of [masterContext, p1Context, p2Context]) {
      await ctx.route("**/rest/v1/rpc/**", async (route) => {
        const request = route.request(),
          headers = request.headers();
        const response = await relay(
          request.url(),
          request.postData() || "{}",
          {
            apikey: headers.apikey,
            Authorization: headers.authorization,
            "Content-Type": "application/json",
          },
        );
        await route.fulfill({
          status: response.status,
          body: response.body,
          contentType: "application/json",
        });
      });
      ctx.on("page", (page) =>
        page.on("pageerror", (e) => errors.push(e.message)),
      );
    }
    await masterContext.addInitScript(
      ({ a, b, campaignId, ak, bk }) => {
        if (!location.protocol.startsWith("http")) return;
        if (localStorage.getItem("fenix.workspace.v1")) return;
        localStorage.setItem(
          "fenix.workspace.v1",
          JSON.stringify({
            version: 1,
            state: {
              agents: [a, b],
              campaigns: [
                {
                  id: campaignId,
                  name: "Campanha de verificação",
                  description: "",
                  element: "Energia",
                  notes: "preservar campanha",
                  rules: "Livro Básico",
                },
              ],
              encounters: [],
              rolls: [],
              brews: [],
              threats: [],
            },
          }),
        );
        localStorage.setItem(
          "fenix.share-links.v1",
          JSON.stringify({
            [a.id]: {
              masterToken: ak.master_token,
              playerToken: ak.player_token,
            },
            [b.id]: {
              masterToken: bk.master_token,
              playerToken: bk.player_token,
            },
          }),
        );
      },
      { a, b, campaignId, ak, bk },
    );
    const master = await masterContext.newPage(),
      p1 = await p1Context.newPage(),
      p2 = await p2Context.newPage();
    await master.goto(base + "/campanhas");
    await master
      .getByRole("button", { name: "Campanha de verificação", exact: true })
      .click();
    await master
      .getByLabel("Nome do novo combate")
      .fill("Encontro compartilhado");
    await master
      .getByRole("button", { name: "Criar combate", exact: true })
      .click();
    await master
      .getByRole("button", { name: "Adicionar personagem", exact: true })
      .click();
    await master
      .getByRole("button", {
        name: "Parente de verificação · NEX 35",
        exact: true,
      })
      .click();
    await master
      .getByRole("button", { name: "Adicionar personagem", exact: true })
      .click();
    await master
      .locator(".combat-agent-choice")
      .filter({ hasText: "Expert de verificação" })
      .getByRole("button", {
        name: "Adicionar NEX 65",
        exact: true,
      })
      .click();
    await master
      .getByRole("button", { name: "Adicionar ameaça", exact: true })
      .click();
    await master
      .getByRole("dialog")
      .getByLabel("Buscar ameaça")
      .fill("Hikikomori");
    await master
      .getByRole("dialog")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    await Promise.all([
      p1.goto(
        `${base}/agentes/${a.id}?mode=player&agent=${a.id}&share=${ak.player_token}`,
      ),
      p2.goto(
        `${base}/agentes/${b.id}?mode=player&agent=${b.id}&share=${bk.player_token}`,
      ),
    ]);
    await p1
      .getByRole("heading", { name: a.name, exact: true, level: 1 })
      .waitFor();
    await p2
      .getByRole("heading", { name: b.name, exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await p1.getByRole("region", { name: "Combate compartilhado" }).count(),
      0,
    );
    await master
      .getByRole("button", { name: "Iniciar / Retomar", exact: true })
      .click();
    const c1 = p1.getByRole("region", { name: "Combate compartilhado" }),
      c2 = p2.getByRole("region", { name: "Combate compartilhado" });
    await expect(c1).toBeVisible({ timeout: 15000 });
    await expect(c2).toBeVisible({ timeout: 15000 });
    await expect(c1).toContainText("3d20 (maior) +13");
    await expect(c2).toContainText("2d20 (menor) +15");
    assert.equal(await c1.getByText("Hikikomori", { exact: true }).count(), 0);
    await Promise.all([
      c1.getByRole("button", { name: "Rolar minha iniciativa" }).click(),
      c2.getByRole("button", { name: "Rolar minha iniciativa" }).click(),
    ]);
    await expect(p1.locator(".notice")).toContainText("3d20 (maior) +13");
    await expect(p2.locator(".notice")).toContainText("2d20 (menor) +15");
    await c1.getByLabel("Minha iniciativa").fill("77");
    await c1.getByRole("button", { name: "Informar iniciativa" }).click();
    await expect(c1).toContainText("Iniciativa 77");
    const relativeRow = master
      .locator(".combat-participants>li")
      .filter({ hasText: "Parente de verificação" });
    await expect(relativeRow.locator('input[type="number"]')).toHaveValue(
      "77",
      { timeout: 15000 },
    );
    await master.getByRole("button", { name: "Revelar Hikikomori" }).click();
    await expect(c1).toContainText("Hikikomori", { timeout: 15000 });
    await master
      .getByLabel("Alvo do dano ou cura")
      .selectOption({ label: "Parente de verificação" });
    await master.getByLabel("Valor de dano ou cura").fill("7");
    await master
      .getByRole("button", { name: "Aplicar dano", exact: true })
      .click();
    await expect(c1).toContainText("PV 23 /", { timeout: 15000 });
    const after = await rpc<{ agent: typeof a }>("fenix_load_shared_agent", {
      requested_agent_id: a.id,
      share_token: ak.player_token,
    });
    assert.equal(after.agent.resources.pv, 50);
    assert.equal(after.agent.alternate!.face.resources.pv, 23);
    assert.equal(after.agent.notes, "preservar ficha principal");
    await master
      .getByLabel("Alvo do dano ou cura")
      .selectOption({ label: "Hikikomori" });
    await master.getByLabel("Valor de dano ou cura").fill("9");
    await master
      .getByRole("button", { name: "Aplicar dano", exact: true })
      .click();
    await expect(
      master
        .locator(".combat-participants>li")
        .filter({ hasText: "Hikikomori" }),
    ).toContainText("26 / 35");
    assert.ok(
      !(
        await c1.locator("li").filter({ hasText: "Hikikomori" }).innerText()
      ).includes("26"),
    );
    for (let i = 0; i < 3; i++)
      await master
        .getByRole("button", { name: "Próximo turno", exact: true })
        .click();
    await expect(c1).toContainText("RODADA 2", { timeout: 15000 });
    await expect(c2).toContainText("RODADA 2", { timeout: 15000 });
    await master.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(c1).toContainText("Combate pausado", { timeout: 15000 });
    await p1.screenshot({
      path: "/tmp/fenix-player-combat.png",
      fullPage: true,
    });
    await p1.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p1.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p1.screenshot({
      path: "/tmp/fenix-player-combat-mobile.png",
      fullPage: true,
    });
    await master
      .getByRole("button", { name: "Encerrar combate", exact: true })
      .click();
    await expect(c1).toHaveCount(0, { timeout: 15000 });
    await expect(c2).toHaveCount(0, { timeout: 15000 });
    await p1.reload();
    await p1
      .getByRole("heading", { name: a.name, exact: true, level: 1 })
      .waitFor();
    assert.equal(await c1.count(), 0);
    await master
      .getByRole("button", { name: "Excluir combate", exact: true })
      .click();
    await expect(
      master.getByLabel("Selecionar combate").locator("option"),
    ).toHaveCount(1, { timeout: 15000 });
    await master.reload();
    await master
      .getByRole("button", { name: "Campanha de verificação", exact: true })
      .click();
    await expect(
      master.getByLabel("Selecionar combate").locator("option"),
    ).toHaveCount(1);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "Live browser verification passed: master + two players, training/equipment, main/NEX35 HP, threat damage, hidden data, initiative concurrency, rounds/pause/end, mobile, persistence; no page errors.",
    );
  } finally {
    await browser.close();
    globalThis.fetch = originalFetch;
  }
}
void verify().catch((error) => {
  console.error(String(error).replace(/[a-f0-9]{64}/g, "[test-token]"));
  process.exitCode = 1;
});
