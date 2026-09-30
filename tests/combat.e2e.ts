/** Run against npm start/dev: FENIX_TEST_BROWSER=/path/to/chrome node --import tsx tests/combat.e2e.ts */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newAgent } from "../lib/rules";
import type { Encounter } from "../lib/model";
async function verifyUI() {
  const browser = await chromium.launch({
    executablePath: process.env.FENIX_TEST_BROWSER || undefined,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.FENIX_TEST_URL || "http://localhost:3000";
  const id = crypto.randomUUID(),
    main = newAgent("Agente de teste"),
    relative = newAgent("Parente de teste");
  main.campaign_id = id;
  main.nex = 65;
  main.resources.pv = 50;
  relative.nex = 35;
  relative.resources.pv = 30;
  main.alternate = { approvedCampaignId: id, face: relative };
  let shared = structuredClone(main),
    writes = 0;
  let combat: Encounter | null = null,
    revision = 0;
  await context.route("**/rest/v1/rpc/**", async (route) => {
    const body = route.request().postDataJSON();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/fenix_load_shared_agent"))
      await route.fulfill({
        json: {
          agent: shared,
          rolls: [],
          role: "master",
          updated_at: new Date().toISOString(),
          alternate_edits: [],
          infection: { enabled: false, value: 0 },
        },
      });
    else if (path.endsWith("/fenix_save_shared_agent")) {
      shared = body.agent_data;
      writes++;
      await route.fulfill({ json: null });
    } else if (path.endsWith("/fenix_load_master_combat")) {
      await route.fulfill({ json: { encounter: combat, revision } });
    } else if (path.endsWith("/fenix_save_combat")) {
      combat = body.encounter_data;
      await route.fulfill({
        json: { encounter: combat, revision: ++revision },
      });
    } else if (path.endsWith("/fenix_adjust_combat_hp")) {
      const participant = combat!.participants.find(
        (p) => p.id === body.participant_id,
      )!;
      participant.pv = Math.max(
        0,
        Math.min(participant.maxPv, participant.pv + body.change),
      );
      if (participant.agentId) {
        shared.alternate!.face.resources.pv = participant.pv;
        writes++;
      }
      await route.fulfill({
        json: {
          encounter: combat,
          revision: ++revision,
          agent: participant.agentId ? shared : null,
        },
      });
    } else if (path.endsWith("/fenix_clear_combat")) {
      combat = null;
      await route.fulfill({
        json: { encounter: combat, revision: ++revision },
      });
    } else
      await route.fulfill({
        status: 500,
        json: { message: "Unexpected RPC in test: " + path },
      });
  });
  try {
    await page.goto(base + "/ameacas");
    await page.getByLabel("Buscar ameaça").waitFor();
    await page.evaluate(
      ({ main, campaignId }) => {
        localStorage.setItem(
          "fenix.workspace.v1",
          JSON.stringify({
            version: 1,
            state: {
              agents: [main],
              campaigns: [
                {
                  id: campaignId,
                  name: "APOCALYPSIS TESTE",
                  description: "",
                  element: "Energia",
                  notes: "preservar notas",
                  rules: "Livro Básico",
                },
              ],
              rolls: [],
              encounters: [],
              brews: [],
            },
          }),
        );
        localStorage.setItem(
          "fenix.share-links.v1",
          JSON.stringify({
            [main.id]: {
              masterToken: "test-master",
              playerToken: "test-player",
            },
          }),
        );
      },
      { main, campaignId: id },
    );
    await page.reload();
    await page.getByLabel("Buscar ameaça").fill("Hikikomori");
    await page
      .getByRole("heading", { name: "Hikikomori", exact: true })
      .waitFor();
    assert.equal(await page.locator(".threat-card").count(), 1);
    await page.getByRole("button", { name: "Ver ficha", exact: true }).click();
    await page.getByRole("dialog", { name: "Hikikomori" }).waitFor();
    assert.ok((await page.getByRole("dialog").innerText()).includes("35"));
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("link", { name: "Campanhas", exact: true }).click();
    await page
      .getByRole("button", { name: "APOCALYPSIS TESTE", exact: true })
      .click();
    await page.getByLabel("Nome do novo combate").fill("Encontro de teste");
    await page
      .getByRole("button", { name: "Criar combate", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Adicionar personagem", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Parente de teste · NEX 35", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Adicionar ameaça", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Buscar ameaça")
      .fill("Hikikomori");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    assert.equal(await page.locator(".combat-participants>li").count(), 2);
    await page
      .getByRole("button", { name: "Rolar iniciativas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Iniciar / Retomar", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Próximo turno", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Próximo turno", exact: true })
      .click();
    await page.getByText("RODADA 2", { exact: true }).waitFor();
    await page
      .getByLabel("Adicionar condição a Hikikomori")
      .selectOption("Abalado");
    await page
      .getByRole("button", { name: "Abalado ×", exact: true })
      .waitFor();
    await page
      .getByLabel("Alvo do dano ou cura")
      .selectOption({ label: "Parente de teste" });
    await page.getByLabel("Valor de dano ou cura").fill("7");
    await page
      .getByRole("button", { name: "Aplicar dano", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".combat-participants")
        ?.textContent?.includes("23 /"),
    );
    assert.equal(writes, 1);
    assert.equal(shared.resources.pv, 50);
    assert.equal(shared.alternate!.face.resources.pv, 23);
    await page.getByRole("button", { name: "Curar", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".combat-participants")
        ?.textContent?.includes("30 /"),
    );
    assert.equal(writes, 2);
    assert.equal(shared.alternate!.face.resources.pv, 30);
    await page.reload();
    await page
      .getByRole("button", { name: "APOCALYPSIS TESTE", exact: true })
      .click();
    await page.getByText("RODADA 2", { exact: true }).waitFor();
    assert.equal(await page.locator(".combat-participants>li").count(), 2);
    assert.ok(
      await page.getByText("preservar notas", { exact: true }).isVisible(),
    );
    await page.screenshot({ path: "/tmp/fenix-combat.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/ameacas");
    await page.getByLabel("Buscar ameaça").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "/tmp/fenix-threats-mobile.png",
      fullPage: false,
    });
    await page.goto(base + "/ameacas?mode=player&agent=" + main.id);
    await page
      .getByText("O catálogo de ameaças está disponível para o mestre.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".threat-card").count(), 0);
    await page.goto(base + "/campanhas?mode=player&agent=" + main.id);
    await page
      .getByRole("heading", { name: "Área do mestre", exact: true })
      .waitFor();
    assert.equal(await page.locator(".combat").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Browser verification passed: catalog/search/details, NEX 35 shared HP contract, initiatives/rounds, conditions, persistence, mobile, player guards; no page errors.",
    );
  } finally {
    await browser.close();
  }
}
verifyUI().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
