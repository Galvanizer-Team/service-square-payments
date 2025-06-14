import { Subscription } from "../database/Subscription"
import fetch from "node-fetch"
import convertToFormata from "./convertToFormdata"
import CodedError from "../config/CodedError"
import axios from "axios"
import sendEmail from "./sendEmail"

export default async function toggleSubscription(subscription_id, options) {
  const { scramble = false, status = "pause" } = options || {}

  console.log(11)

  let active
  let is_premium = 0
  switch (status) {
    case "pause":
      active = 0
      is_premium = 0
      break
    case "cancel":
      active = 1
      is_premium = 0
      break
    case "suspend":
    case "suspended":
      is_premium = 0
      active = 1
      break
    case "active":
      active = 1
      is_premium = 1
      break
  }

  console.log(12)

  if (typeof active === "undefined") throw new CodedError("Invalid status", "TS00")

  function scrambleEmail(email) {
    return "cancelled" + email.split("@")[0] + "+" + Math.floor(Math.random() * 100000) + "@" + email.split("@")[1]
  }

  const subscription = await Subscription.findOne({ where: { subscription_id } })
  if (!subscription) throw new CodedError("Subscription not found", "TS01")

  console.log(13)

  if (is_premium === 1) {
    // when resuming a subscription, update the renewal based on suspension_date
    const suspension_date = subscription?.dataValues?.suspension_date
    if (suspension_date) {
      // check how many days have passed since suspension
      const daysSinceSuspension = Math.floor((new Date() - new Date(suspension_date)) / (1000 * 60 * 60 * 24))
      // update renewal_date based on days since suspension
      const renewal_date = new Date(
        new Date(subscription?.dataValues?.renewal_date).getTime() + daysSinceSuspension * 24 * 60 * 60 * 1000
      )
      await subscription.update({ renewal_date })
    }
  } else {
    // when suspending a subscription, update the suspension_date
    await subscription.update({ suspension_date: new Date() })
  }

  console.log(14)

  // if the subscription has a team id, deactivate the members on the team
  const team_id = subscription?.dataValues?.data?.team_id
  if (team_id) {
    const teamMembers = await fetch(process.env.API_URL + "/users?team_id=" + team_id, {
      method: "GET",
      headers: { "x-api-token": process.env.API_MASTER_TOKEN },
    })
    const teamMembersResponse = await teamMembers.json()
    if (teamMembersResponse?.success !== "success") throw new CodedError("TS02: Error fetching team members", "TS02")

    teamMembersResponse?.data?.forEach(async (member) => {
      const body = { active, is_premium }
      const deactivateMember = await fetch(process.env.API_URL + "/users/" + member?.user_id, {
        method: "PUT",
        headers: { "x-api-token": process.env.API_MASTER_TOKEN },
        body: convertToFormata(body),
      })
      const deactivateMemberResponse = await deactivateMember.json()
      if (deactivateMemberResponse?.success !== "success") {
        throw new CodedError("Error deactivating team member", "TS03")
      }
    })
  } else {
    console.log(111)

    // fetch the user
    const user = await fetch(process.env.API_URL + "/users/" + subscription?.dataValues?.user_id, {
      method: "GET",
      headers: { "x-api-token": process.env.API_MASTER_TOKEN },
    })
    const userResponse = await user.json()

    console.log(112)

    const body = { active, is_premium }
    // deactivate the user

    console.log(113)
    console.log(process.env.API_URL_V2 + "/users/" + subscription?.dataValues?.user_id)

    const deactivateUser = await fetch(process.env.API_URL_V2 + "/users/" + subscription?.dataValues?.user_id, {
      method: "PUT",
      headers: {
        "x-api-token": process.env.API_MASTER_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })

    console.log(114)

    let text = await deactivateUser.text()
    // cut out anything before the first {
    text = text.substring(text.indexOf("{"))
    // parse the text as json
    try {
      console.log("Before parse", text)
      text = JSON.parse(text)
    } catch (error) {
      console.log("Error parsing JSON", error)
    }
    console.log("text", text)

    if (text?.success !== "success") throw new CodedError("Error deactivating user", "TS04")

    console.log(115)
  }

  console.log(15)

  // get user email
  const user = await axios.get(`${process.env.API_URL}/users/${subscription.user_id}`, {
    headers: {
      "x-api-token": process.env.API_MASTER_TOKEN,
    },
  })

  console.log(16)

  const email = user?.data?.data?.email
  if (!email) {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "Subscription Toggle Error",
      text: `Subscription ${subscription.subscription_name} was toggled, but no user email was found`,
    })
  } else {
    let msg
    switch (status) {
      case "pause":
        msg = {
          subject: "Subscription Paused",
          text: `Your CashOffers.PRO Subscription (${subscription.subscription_name}) has been paused`,
          template: "subscriptionPaused.html",
          fields: {
            subscription: subscription.subscription_name,
          },
        }
        break
      case "suspend":
        msg = {
          subject: "Subscription Suspended",
          text: `Your CashOffers.PRO Subscription (${subscription.subscription_name}) has been suspended`,
          template: "subscriptionSuspended.html",
          fields: {
            subscription: subscription.subscription_name,
            link: process.env.FRONTEND_URL + "/manage?email=" + email,
          },
        }
        break
      case "active":
        msg = {
          subject: "Subscription Resumed",
          text: `Your CashOffers.PRO Subscription (${subscription.subscription_name}) has been resumed`,
        }
        break
    }

    await sendEmail({
      to: email,
      ...msg,
    })
  }

  console.log(17)

  await subscription.update({ status })

  console.log(18)
}
