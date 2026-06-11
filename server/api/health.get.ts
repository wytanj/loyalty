import { defineLoyaltyHandler } from "@server/utils/route";

export default defineLoyaltyHandler(() => ({
  ok: true,
  service: "headless-loyalty",
  frontend: false
}));
