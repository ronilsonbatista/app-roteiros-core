import {
  ImageBankImageVariant,
  ImageBankSpotImage,
  ImageBankStatus,
} from '@prisma/client';
import { StoredObjectUrl } from '../media/providers/media-storage.interface';

export interface PublicSpotImage {
  id: string;
  spotName: string;
  altText: string;
  sortOrder: number;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
  urlExpiresAt: string | null;
}

export interface AdminSpotImage extends PublicSpotImage {
  variant: ImageBankImageVariant;
  storageKey: string;
}

export interface PublicCity {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  sortOrder: number;
  images: PublicSpotImage[];
}

export interface PublicCityDetail extends PublicCity {
  destination: {
    slug: string;
    name: string;
    country: string;
  };
}

export interface PublicDestinationDetail {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  summary: string | null;
  baseTripId: string | null;
  cities: PublicCity[];
}

export interface PublicDestinationListItem {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  summary: string | null;
  baseTripId: string | null;
  publishedCityCount: number;
}

export interface CitySummary {
  id: string;
  destinationId: string;
  slug: string;
  name: string;
  summary: string | null;
  sortOrder: number;
  status: ImageBankStatus;
  originalImageCount: number;
}

export interface AdminDestinationListItem {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  summary: string | null;
  status: ImageBankStatus;
  baseTripId: string | null;
  publishedCityCount: number;
  draftCityCount: number;
  originalImageCount: number;
}

export interface AdminCityDetail extends CitySummary {
  images: AdminSpotImage[];
}

export interface AdminDestinationDetail {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  summary: string | null;
  status: ImageBankStatus;
  baseTripId: string | null;
  cities: AdminCityDetail[];
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface DeletedImageBankRecord {
  id: string;
  deletedImageRows: number;
}

export function toPublicImage(
  image: ImageBankSpotImage,
  read: StoredObjectUrl,
): PublicSpotImage {
  return {
    id: image.id,
    spotName: image.spotName,
    altText: image.altText,
    sortOrder: image.sortOrder,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    url: read.url,
    urlExpiresAt: read.expiresAt,
  };
}

export function toAdminImage(
  image: ImageBankSpotImage,
  read: StoredObjectUrl,
): AdminSpotImage {
  return {
    ...toPublicImage(image, read),
    variant: image.variant,
    storageKey: image.storageKey,
  };
}
