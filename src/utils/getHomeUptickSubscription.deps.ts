import { db } from "@/lib/database"
import axios from "axios"
import { Selectable } from "kysely"
import { HomeuptickSubscriptions, Users } from "@/lib/db"

/**
 * Retrieves a user from the database by their user ID.
 *
 * @param {string|number} user_id - The unique identifier of the user to fetch.
 * @returns {Promise<Object|null>} A promise that resolves to the user object if found, or null if not found.
 */
export const getUserFromDB = async (user_id: number): Promise<Selectable<Users> | undefined> => {
  const user = await db.selectFrom("Users").where("user_id", "=", user_id).selectAll().executeTakeFirst()

  return user
}

/**
 * Retrieves the active Homeuptick subscription for a given user from the database.
 */
export const getSubscriptionFromDB = async (
  user_id: number
): Promise<Selectable<HomeuptickSubscriptions> | undefined> => {
  const subscription = await db
    .selectFrom("Homeuptick_Subscriptions")
    .where("user_id", "=", user_id)
    .where("active", "=", 1)
    .selectAll()
    .executeTakeFirst()

  return subscription
}

/**
 * Retrieves the total number of clients from the HomeUptick API.
 *
 * @param {string} apiKey - The API key used for authentication.
 */
export const getClientsCount = async (apiKey: string): Promise<{ count: number }> => {
  const clientsCount = await axios.get(`${process.env.HOMEUPTICK_URL}/api/clients/count`, {
    headers: {
      "x-api-token": apiKey,
    },
  })

  return clientsCount.data
}
