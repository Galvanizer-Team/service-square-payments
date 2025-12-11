import "dotenv/config"
import { describe, it, expect, vi, beforeEach } from "vitest"
import getHomeUptickSubscription from "@/utils/getHomeUptickSubscription"

describe("getHomeUptickSubscription user 94", () => {
  // reset mocks
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("handles user with id 94 correctly", async () => {
    const user_id = 94
    const info = await getHomeUptickSubscription(user_id)

    console.log("!!!!!!!!", info)
  })
})
