import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDynamicAdapter } from "../.test-build/dynamic-gateway.js";

const valid = {
  base_url: "https://payments.example.com",
  topup: { method: "POST", path: "/payments", reference_path: "data.reference" },
  status: { method: "GET", path: "/payments/{{reference}}", status_path: "data.status", amount_path: "data.amount", currency_path: "data.currency", status_map: { success: ["PAID"], failed: ["FAILED"], pending: ["PENDING"] } },
};
void describe("configuration-driven payment adapters", () => {
  void it("accepts an HTTPS adapter with top-up and reconciliation mappings", () => {
    assert.equal(validateDynamicAdapter(valid).base_url, valid.base_url);
  });
  void it("rejects non-HTTPS and private/local adapter hosts", () => {
    assert.throws(() => validateDynamicAdapter({ ...valid, base_url: "http://payments.example.com" }), /adapter_url_not_allowed/);
    assert.throws(() => validateDynamicAdapter({ ...valid, base_url: "https://127.0.0.1" }), /adapter_url_not_allowed/);
    assert.throws(() => validateDynamicAdapter({ ...valid, base_url: "https://localhost" }), /adapter_url_not_allowed/);
  });
  void it("requires explicit successful, failed and pending status mappings", () => {
    assert.throws(() => validateDynamicAdapter({ ...valid, status: { ...valid.status, status_map: { success: ["PAID"], failed: ["FAILED"] } } }), /adapter_status_map_incomplete/);
  });
  void it("rejects incomplete mappings and unsafe HTTP methods", () => {
    assert.throws(() => validateDynamicAdapter({ ...valid, status: { method: "GET", path: "/status" } }), /adapter_config_incomplete/);
    assert.throws(() => validateDynamicAdapter({ ...valid, topup: { ...valid.topup, method: "DELETE" } }), /adapter_operation_invalid/);
  });
});