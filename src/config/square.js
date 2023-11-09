import { Client, Environment, ApiError } from "square"

export const client = new Client({
  environment: process.env.SQUARE_ENVIRONMENT === "sandbox" ? Environment.Sandbox : Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
})

const { paymentsApi } = client

export async function getPayments() {
  try {
    let response = await paymentsApi.listPayments()

    return response.result.payments
  } catch (error) {
    if (error instanceof ApiError) {
      error.result.errors.forEach(function (e) {
        console.log(e.category)
        console.log(e.code)
        console.log(e.detail)
      })
      return error.result.errors
    } else {
      console.log("Unexpected error occurred: ", error)
      return error
    }
  }
}
