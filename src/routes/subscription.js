import express from "express"
import authMiddleware from "../middleware/authMiddleware"
import { Subscription } from "../database/Subscription"
import { UserCard } from "../database/UserCard"
import { Transaction } from "../database/Transaction"
import toggleSubscription from "../utils/toggleSubscription"
import sendEmail from "@/utils/sendEmail"

const router = express.Router()

router.get("/", authMiddleware("payments_read_all", { allowSelf: true }), async (req, res) => {
  const { page = 1, limit = 20 } = req.query

  try {
    // sort by most recent
    const subscriptions = await Subscription.findAll({
      order: [["createdAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
    })
    const total = await Subscription.count()
    res.json({ success: "success", data: subscriptions, page, limit, total })
  } catch (error) {
    res.json({ success: "error", error: error.message })
  }
})

// get your own subscription
router.get("/single", authMiddleware(null, { allowSelf: true }), async (req, res) => {
  const { user_id } = req.user
  try {
    const subscription = await Subscription.findOne({ where: { user_id } })
    res.json({ success: "success", data: [subscription] })
  } catch (error) {
    res.json({ success: "error", error: error.message })
  }
})

router.put("/", authMiddleware("payments_create"), async (req, res) => {
  const { user_id, subscription_name, amount, duration, status } = req.body

  try {
    const updateBody = {}
    if (subscription_name) updateBody.subscription_name = subscription_name
    if (amount) updateBody.amount = amount
    if (duration) updateBody.duration = duration
    if (status) updateBody.status = status

    await Subscription.update(updateBody, { where: { user_id } })

    // log transaction
    await Transaction.create({
      user_id,
      amount: 0,
      type: "subscription",
      memo: subscription_name + " updated",
      data: JSON.stringify(updateBody),
    })

    res.json({ success: "success", data: updateBody })
  } catch (error) {
    // log transaction
    await Transaction.create({
      user_id,
      amount: 0,
      type: "subscription",
      memo: subscription_name + " failed to update",
      data: error.message,
    })
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.post("/pause/:subscription_id", authMiddleware("payments_create", { allowSelf: true }), async (req, res) => {
  // pause a subscription
  const { subscription_id } = req.params

  try {
    if (!subscription_id) throw new Error("subscription_id is required")

    // run pause script for the subscription
    await toggleSubscription(subscription_id)

    res.json({ success: "success", data: { subscription_id } })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.post("/resume/:subscription_id", authMiddleware("payments_create", { allowSelf: true }), async (req, res) => {
  // resume a subscription
  const { subscription_id } = req.params

  try {
    if (!subscription_id) throw new Error("subscription_id is required")

    // run resume script for the subscription
    await toggleSubscription(subscription_id, {
      status: "active",
    })

    res.json({ success: "success", data: { subscription_id } })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.post("/cancel/:subscription_id", authMiddleware(null, { allowSelf: true }), async (req, res) => {
  // cancel a subscription
  const { subscription_id } = req.params

  try {
    if (!subscription_id) throw new Error("subscription_id is required")

    const subscription = await Subscription.findOne({ where: { subscription_id } })
    if (!subscription) throw new Error("subscription not found")

    const userOwnsSub = req.user?.user_id === subscription?.dataValues?.user_id
    const userHasPermission = req?.user?.capabilities?.includes("payments_create")
    if (!userOwnsSub && !userHasPermission) throw new Error("0000E: Unauthorized")

    await subscription.update({ cancel_on_renewal: true })

    res.on("finish", async () => {
      try {
        const user = await fetch(process.env.API_URL + "/users/" + subscription?.dataValues?.user_id, {
          method: "GET",
          headers: { "x-api-token": process.env.API_MASTER_TOKEN },
        })
        const userResponse = await user.json()

        // send email to annette
        await sendEmail({
          to: "annette@remrktco.com",
          subject: "Subscription Set to Cancel",
          text: ``,
          template: "subscriptionCancelled.html",
          fields: {
            name: userResponse?.data?.name,
            email: userResponse?.data.email,
          },
        })
      } catch (error) {
        console.error("Error sending email: ", error)
      }
    })

    res.json({ success: "success", data: { subscription_id } })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.post("/uncancel/:subscription_id", authMiddleware(null, { allowSelf: true }), async (req, res) => {
  // cancel a subscription
  const { subscription_id } = req.params

  try {
    if (!subscription_id) throw new Error("subscription_id is required")

    const subscription = await Subscription.findOne({ where: { subscription_id } })
    if (!subscription) throw new Error("subscription not found")

    const userOwnsSub = req.user?.user_id === subscription?.dataValues?.user_id
    const userHasPermission = req?.user?.capabilities?.includes("payments_create")
    if (!userOwnsSub && !userHasPermission) throw new Error("0000E: Unauthorized")

    await subscription.update({ cancel_on_renewal: false })

    res.json({ success: "success", data: { subscription_id } })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.post("/", authMiddleware("payments_create"), async (req, res) => {
  // create a new subscription, or update an existing one
  const { subscription_name, user_id, amount, duration } = req.body

  // todo: add libary of subscriptions

  try {
    if (!subscription_name) throw new Error("subscription_name is required")
    if (!user_id) throw new Error("user_id is required")
    if (!amount) throw new Error("amount is required")
    if (!duration) throw new Error("duration is required")

    // get card token from database
    const userCard = await UserCard.findOne({ where: { user_id } })
    if (!userCard) throw new Error("No card found")
    const card_id = userCard?.dataValues?.card_id

    // get subscription from database
    const subscription = await Subscription.findOne({ where: { user_id } })
    const updateData = {
      subscription_name,
      user_id,
      amount,
      duration,
      renewal_date: new Date(),
      status: "active",
    }
    if (subscription) await Subscription.update(updateData, { where: { user_id } })
    else await Subscription.create(updateData)

    // log transaction
    await Transaction.create({
      user_id,
      amount,
      type: "subscription",
      memo: subscription_name + " created",
    })

    res.json({ success: "success", data: updateData })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

router.delete("/", authMiddleware("payments_delete"), async (req, res) => {
  // deactivate a subscription by user_id
  const { user_id } = req.body

  try {
    if (!user_id) throw new Error("user_id is required")

    await Subscription.update({ status: "inactive" }, { where: { user_id } })

    res.json({ success: "success", data: { user_id } })
  } catch (error) {
    res.json({ success: "error", error: error.message, body: req.body })
  }
})

const subscriptionRoutes = router
export default subscriptionRoutes
