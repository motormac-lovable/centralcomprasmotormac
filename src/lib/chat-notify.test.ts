import { describe, it, expect } from "vitest";
import { shouldNotifyChat } from "./chat-notify";

const card = { requester_id: "sol", assigned_to: null, buyer_name: "Ana Compras" };
const sol = { id: "sol", name: "Joao" }, comp = { id: "comp", name: "Ana Compras" }, apr = { id: "apr", name: "Gestor" };
describe("via dupla do chat", () => {
  it("solicitante escreve → só comprador", () => {
    expect(shouldNotifyChat(sol, comp, card)).toBe(true);
    expect(shouldNotifyChat(sol, apr, card)).toBe(false);
  });
  it("comprador escreve → só solicitante", () => {
    expect(shouldNotifyChat(comp, sol, card)).toBe(true);
    expect(shouldNotifyChat(comp, apr, card)).toBe(false);
  });
  it("terceiro escreve → ambos", () => {
    expect(shouldNotifyChat(apr, sol, card)).toBe(true);
    expect(shouldNotifyChat(apr, comp, card)).toBe(true);
  });
});
