import { getClientsCount, getSubscriptionFromDB, getUserFromDB } from "@/utils/getHomeUptickSubscription.deps"

interface HomeUptickSubscription {
  id: number
  user_id: number
  contacts: number
  contactsOnThisTier: number
  amount: number
  tier: number
}

/**
 * Gets the HomeUptick subscription for a user, including the amount and tier
 *
 * @param {*} user_id
 */
const getHomeUptickSubscription = async (user_id: number): Promise<null | HomeUptickSubscription> => {
  try {
    const user = await getUserFromDB(user_id)

    if (!user) {
      console.error(`User with id ${user_id} not found`)
      return null
    }

    if (!user.api_token) {
      console.error(`User ${user_id} does not have an API token set`)
      return null
    }

    if (!user?.active) {
      console.error(`User ${user_id} is not active`)
      return null // if user is inactive, we're not gonna charge them
    }

    const subscription = await getSubscriptionFromDB(user_id)
    if (!subscription) {
      console.error(`No HomeUptick subscription found for user ${user_id}`)
      return null
    }

    const clientsCount = await getClientsCount(user.api_token)
    const count = clientsCount?.count || 0

    console.log(clientsCount)

    if (!count) {
      console.log(`User ${user_id} has no clients`)
      return null // if they have no clients, we're not gonna charge them
    }

    let tier = 1

    if (count > subscription.base_contacts!) {
      tier = Math.ceil((count - subscription.base_contacts!) / subscription.contacts_per_tier!) + 1
    }

    const amount = (tier - 1) * subscription.price_per_tier!
    const contactsOnThisTier = subscription.base_contacts! + (tier - 1) * subscription.contacts_per_tier!

    return {
      id: subscription.homeuptick_id!,
      user_id: subscription.user_id,
      contacts: count,
      contactsOnThisTier,
      amount,
      tier,
    }
  } catch (error) {
    console.error(`Error in getHomeUptickSubscription for user ${user_id}:`, error)
    return null
  }
}

export default getHomeUptickSubscription
