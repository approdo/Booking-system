import type { Service, ServiceOption } from '../types/api'
import type { ServiceCategory } from '../types/content'

/**
 * The services of the first booking screen (spec section 6). Each length of a service is one radio of the
 * group "option", with the value '<service id>:<minutes>'.
 *
 * Plain TypeScript, so the unit tests can check it.
 */
export type ServiceChoice = Pick<Service, 'id' | 'categoryId' | 'name' | 'description' | 'includes' | 'options'>

/** The starting data's services (app/data/seed.ts), as the API would list them. */
export function servicesFromCategories(categories: readonly ServiceCategory[]): ServiceChoice[] {
  return categories.flatMap(category => category.items.map(item => ({
    id: item.id,
    categoryId: category.id,
    name: item.name,
    description: item.description,
    includes: item.includes ?? null,
    options: [...item.options],
  })))
}

export function choiceValue(serviceId: string, minutes: number): string {
  return `${serviceId}:${minutes}`
}

/** The service and length of a radio value, or null when the list has no such service or length. */
export function findChoice(services: readonly ServiceChoice[], value: string | null): { service: ServiceChoice, option: ServiceOption } | null {
  if (!value) return null
  const separator = value.lastIndexOf(':')
  const id = value.slice(0, separator)
  const minutes = Number(value.slice(separator + 1))
  const service = services.find(item => item.id === id)
  const option = service?.options.find(item => item.minutes === minutes)
  return service && option ? { service, option } : null
}
