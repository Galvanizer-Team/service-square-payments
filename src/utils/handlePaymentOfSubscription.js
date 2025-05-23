import createNewRenewalDate from "../utils/createNewRenewalDate"
import createPayment from "../utils/createPayment"
import toggleSubscription from "./toggleSubscription"
import sendEmail from "./sendEmail"
import { Transaction } from "../database/Transaction"

export default async function handlePaymentOfSubscription(subscription, email, options) {
  let { user_id, amount, subscription_name: memo, status, product_id } = subscription.dataValues
  const { sendCreationEmail, signupFee } = options || {}

  try {
    if (signupFee) {
      if (typeof signupFee !== "number") throw new Error("0002B: signupFee must be a number")
      amount += signupFee
    }

    let req = { body: { amount, user_id, memo, product_id }, user: { email } }
    if (!email) throw new Error("No email found for this subscription")
    const response = await createPayment(req, {
      sendEmailOnCharge: false,
    })
    if (response?.data?.payment?.status !== "COMPLETED") {
      throw new Error("0002A: Payment failed |" + JSON.stringify(response))
    }

    // update subscription renewal_date
    const renewal_date = createNewRenewalDate(subscription)
    console.log("updating renewal date", renewal_date)
    await subscription.update({ renewal_date, next_renewal_attempt: renewal_date })

    if (status === "suspend") {
      await toggleSubscription(subscription.subscription_id, { status: "active" })
    }

    // send email
    if (sendCreationEmail) {
      await sendEmail({
        to: email,
        subject: "Subscription Created",
        text: `You have been subscribed to ${memo}`,
        template: "subscriptionCreated.html",
        fields: {
          amount: `$${(amount / 100).toFixed(2)}`,
          date: new Date().toLocaleDateString(),
          subscription: memo,
        },
      })
    } else {
      await sendEmail({
        to: email,
        subject: "Subscription Renewal",
        text: `Subscription ${memo} was renewed`,
        template: "subscriptionRenewal.html",
        fields: {
          amount: `$${(amount / 100).toFixed(2)}`,
          date: new Date(renewal_date).toLocaleDateString(),
          subscription: memo,
        },
      })
    }

    // log transaction
    await Transaction.create({
      user_id,
      amount,
      type: "subscription",
      memo,
      data: JSON.stringify(response),
    })
  } catch (error) {
    // send email
    await sendEmail({
      to: email || process.env.ADMIN_EMAIL,
      subject: "Subscription Renewal Failed",
      text: `Subscription ${memo} failed to renew`,
      template: "subscriptionRenewalFailed.html",
      fields: {
        subscription: memo,
        date: new Date().toLocaleDateString(),
        link: process.env.FRONTEND_URL + "/manage?email=" + email,
      },
    })

    // update subscription next_renewal_attempt
    await updateNextRenewalAttempt(subscription)

    // log transaction
    Transaction.create({
      user_id,
      amount,
      type: "subscription",
      memo: memo + " (failed)",
      data: error.message,
    })
  }
}

export async function updateNextRenewalAttempt(subscription) {
  // update subscription next_renewal_attempt
  // logic of days waited: 1, 3, then keep attempting at 7
  const { next_renewal_attempt } = subscription.dataValues
  let daysWaited = 0
  if (next_renewal_attempt) {
    daysWaited = (new Date() - next_renewal_attempt) / (1000 * 60 * 60 * 24)
  }
  let nextAttempt = new Date()
  const today = new Date()

  if (daysWaited <= 1) {
    nextAttempt.setDate(today.getDate() + 1)
  } else if (daysWaited <= 4) {
    nextAttempt.setDate(today.getDate() + 3)
  } else {
    nextAttempt.setDate(today.getDate() + 7)
  }

  await subscription.update({ next_renewal_attempt: nextAttempt })
}
