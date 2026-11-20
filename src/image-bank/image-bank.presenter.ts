import {
  ImageBankImageVariant,
  ImageBankSpotImage,
  ImageBankStatus,
} from '@prisma/image-bank-client';
import { StoredObjectUrl } from '../media/providers/media-storage.interface';

export interface PublicCityRef {
  name: string;
  slug: string;
}

/** Card da lista. Sem as 5 fotos e sem metadados do arquivo. */
export interface PublicDestinationCard {
  name: string;
  slug: string;
  city: PublicCityRef | null;
  coverUrl: string | null;
}

export interface PublicDestinationDetail extends PublicDestinationCard {
  cities: PublicCityRef[];
}

/** Foto no detalhe da cidade. Só o que o app precisa para renderizar. */
export interface PublicSpotImage {
  url: string;
  alt: string;
  order: number;
}

export interface PublicCityDetail {
  name: string;
  slug: string;
  destination: PublicCityRef;
  images: PublicSpotImage[];
}

export interface AdminSpotImage {
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
  variant: ImageBankImageVariant;
  storageKey: string;
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

export function toAdminImage(
  image: ImageBankSpotImage,
  read: StoredObjectUrl,
): AdminSpotImage {
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
    variant: image.variant,
    storageKey: image.storageKey,
  };
}
