import { getServiceBaseUrl, isAllowedServiceLinkUrl } from '../network/service-address';

export { InvalidServiceAddressError as InvalidAddonAddressError } from '../network/service-address';

/** See getServiceBaseUrl: https, or http only for an addon on this computer. */
export function getAddonBaseUrl(address: string): string {
  return getServiceBaseUrl({ address, serviceName: 'addon' });
}

/** Links an addon returns follow the same rule as addon addresses. */
export function isAllowedAddonLinkUrl(value: string): boolean {
  return isAllowedServiceLinkUrl(value);
}
