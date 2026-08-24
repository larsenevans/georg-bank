export const APP_PIN_COOKIE = 'app_pin_verified'
export const APP_PIN_TOKEN = 'granted'

export function getAppPin(): string {
  return process.env.APP_PIN ?? '666666'
}

export function isValidAppPin(pin: string): boolean {
  return pin === getAppPin()
}
