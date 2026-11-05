import { describe, it, expect } from "vitest";
import { chatRecipients } from "./chat-notify";

const card = { requester_id: "sol", assigned_to: "comp" };
describe("via dupla do chat", () => {
  it("solicitante escreve → só comprador", () => expect(chatRecipients("sol", card)).toEqual(["comp"]));
  it("comprador escreve → só solicitante", () => expect(chatRecipients("comp", card)).toEqual(["sol"]));
  it("terceiro escreve → ambos", () => expect(chatRecipients("apr", card)).toEqual(["sol", "comp"]));
});
