/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SocialNetwork, Service, BusinessConfig } from "./types";

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  businessName: "ImpulsaNet",
  logoUrl: "", // Empty means text logo
  whatsapp: "573208354198", // Default Colombian number
  warrantyDays: 30,
  facebookSeeded: true
};

export const DEFAULT_SOCIAL_NETWORKS: SocialNetwork[] = [
  { id: "instagram", name: "Instagram", icon: "Instagram" },
  { id: "facebook", name: "Facebook", icon: "Facebook" },
  { id: "tiktok", name: "TikTok", icon: "Video" },
  { id: "youtube", name: "YouTube", icon: "Youtube" }
];

export const DEFAULT_SERVICES: Service[] = [
  // INSTAGRAM
  {
    id: "ig-followers",
    socialNetworkId: "instagram",
    name: "Seguidores",
    providerCostPer1000: 4538,
    providerCostUSDPer1000: 1.07,
    suggestedPricePer1000: 15000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "ig-f-1000", quantity: 1000, providerCost: 4538, suggestedPrice: 15000, active: true },
      { id: "ig-f-2000", quantity: 2000, providerCost: 9076, suggestedPrice: 30000, active: true },
      { id: "ig-f-5000", quantity: 5000, providerCost: 22690, suggestedPrice: 75000, active: true },
      { id: "ig-f-10000", quantity: 10000, providerCost: 45380, suggestedPrice: 150000, active: true }
    ]
  },
  {
    id: "ig-likes",
    socialNetworkId: "instagram",
    name: "Likes",
    providerCostPer1000: 566,
    suggestedPricePer1000: 8000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "ig-l-1000", quantity: 1000, providerCost: 566, suggestedPrice: 8000, active: true },
      { id: "ig-l-2000", quantity: 2000, providerCost: 1132, suggestedPrice: 16000, active: true },
      { id: "ig-l-5000", quantity: 5000, providerCost: 2830, suggestedPrice: 40000, active: true },
      { id: "ig-l-10000", quantity: 10000, providerCost: 5660, suggestedPrice: 80000, active: true }
    ]
  },
  {
    id: "ig-views",
    socialNetworkId: "instagram",
    name: "Vistas",
    providerCostPer1000: 290,
    suggestedPricePer1000: 1200,
    customPresets: [10000, 20000, 50000, 100000],
    quantities: [
      { id: "ig-v-10000", quantity: 10000, providerCost: 2900, suggestedPrice: 12000, active: true },
      { id: "ig-v-20000", quantity: 20000, providerCost: 5800, suggestedPrice: 24000, active: true },
      { id: "ig-v-50000", quantity: 50000, providerCost: 14500, suggestedPrice: 60000, active: true },
      { id: "ig-v-100000", quantity: 100000, providerCost: 29000, suggestedPrice: 120000, active: true }
    ]
  },
  {
    id: "ig-comments",
    socialNetworkId: "instagram",
    name: "Comentarios",
    providerCostPer1000: 55820,
    suggestedPricePer1000: 180000,
    customPresets: [10, 20, 50, 100],
    quantities: [
      { id: "ig-c-10", quantity: 10, providerCost: 558, suggestedPrice: 1800, active: true },
      { id: "ig-c-20", quantity: 20, providerCost: 1116, suggestedPrice: 3600, active: true },
      { id: "ig-c-50", quantity: 50, providerCost: 2791, suggestedPrice: 9000, active: true },
      { id: "ig-c-100", quantity: 100, providerCost: 5582, suggestedPrice: 18000, active: true }
    ]
  },

  // FACEBOOK
  {
    id: "fb-followers",
    socialNetworkId: "facebook",
    name: "Seguidores",
    providerCostPer1000: 1810,
    suggestedPricePer1000: 15000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "fb-f-1000", quantity: 1000, providerCost: 1810, suggestedPrice: 15000, active: true },
      { id: "fb-f-2000", quantity: 2000, providerCost: 3620, suggestedPrice: 30000, active: true },
      { id: "fb-f-5000", quantity: 5000, providerCost: 9050, suggestedPrice: 75000, active: true },
      { id: "fb-f-10000", quantity: 10000, providerCost: 18100, suggestedPrice: 150000, active: true }
    ]
  },
  {
    id: "fb-likes",
    socialNetworkId: "facebook",
    name: "Likes",
    providerCostPer1000: 1920,
    suggestedPricePer1000: 12000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "fb-l-1000", quantity: 1000, providerCost: 1920, suggestedPrice: 12000, active: true },
      { id: "fb-l-2000", quantity: 2000, providerCost: 3840, suggestedPrice: 24000, active: true },
      { id: "fb-l-5000", quantity: 5000, providerCost: 9600, suggestedPrice: 60000, active: true },
      { id: "fb-l-10000", quantity: 10000, providerCost: 19200, suggestedPrice: 120000, active: true }
    ]
  },
  {
    id: "fb-views",
    socialNetworkId: "facebook",
    name: "Vistas",
    providerCostPer1000: 320,
    suggestedPricePer1000: 1200,
    customPresets: [10000, 20000, 50000, 100000],
    quantities: [
      { id: "fb-v-10000", quantity: 10000, providerCost: 3200, suggestedPrice: 12000, active: true },
      { id: "fb-v-20000", quantity: 20000, providerCost: 6400, suggestedPrice: 24000, active: true },
      { id: "fb-v-50000", quantity: 50000, providerCost: 16000, suggestedPrice: 60000, active: true },
      { id: "fb-v-100000", quantity: 100000, providerCost: 32000, suggestedPrice: 120000, active: true }
    ]
  },
  {
    id: "fb-comments",
    socialNetworkId: "facebook",
    name: "Comentarios",
    providerCostPer1000: 190000,
    suggestedPricePer1000: 450000,
    customPresets: [10, 20, 50, 100],
    quantities: [
      { id: "fb-c-10", quantity: 10, providerCost: 1900, suggestedPrice: 4500, active: true },
      { id: "fb-c-20", quantity: 20, providerCost: 3800, suggestedPrice: 9000, active: true },
      { id: "fb-c-50", quantity: 50, providerCost: 9500, suggestedPrice: 22500, active: true },
      { id: "fb-c-100", quantity: 100, providerCost: 19000, suggestedPrice: 45000, active: true }
    ]
  },

  // TIKTOK
  {
    id: "tt-followers",
    socialNetworkId: "tiktok",
    name: "Seguidores",
    providerCostPer1000: 13000,
    suggestedPricePer1000: 30000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "tt-f-1000", quantity: 1000, providerCost: 13000, suggestedPrice: 30000, active: true },
      { id: "tt-f-2000", quantity: 2000, providerCost: 26000, suggestedPrice: 60000, active: true },
      { id: "tt-f-5000", quantity: 5000, providerCost: 65000, suggestedPrice: 150000, active: true },
      { id: "tt-f-10000", quantity: 10000, providerCost: 130000, suggestedPrice: 300000, active: true }
    ]
  },
  {
    id: "tt-likes",
    socialNetworkId: "tiktok",
    name: "Likes",
    providerCostPer1000: 3000,
    suggestedPricePer1000: 10000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "tt-l-1000", quantity: 1000, providerCost: 3000, suggestedPrice: 10000, active: true },
      { id: "tt-l-2000", quantity: 2000, providerCost: 6000, suggestedPrice: 20000, active: true },
      { id: "tt-l-5000", quantity: 5000, providerCost: 15000, suggestedPrice: 50000, active: true },
      { id: "tt-l-10000", quantity: 10000, providerCost: 30000, suggestedPrice: 100000, active: true }
    ]
  },
  {
    id: "tt-views",
    socialNetworkId: "tiktok",
    name: "Vistas",
    providerCostPer1000: 348,
    suggestedPricePer1000: 1200,
    customPresets: [10000, 20000, 50000, 100000],
    quantities: [
      { id: "tt-v-10000", quantity: 10000, providerCost: 3480, suggestedPrice: 12000, active: true },
      { id: "tt-v-20000", quantity: 20000, providerCost: 6960, suggestedPrice: 24000, active: true },
      { id: "tt-v-50000", quantity: 50000, providerCost: 17400, suggestedPrice: 60000, active: true },
      { id: "tt-v-100000", quantity: 100000, providerCost: 34800, suggestedPrice: 120000, active: true }
    ]
  },
  {
    id: "tt-comments",
    socialNetworkId: "tiktok",
    name: "Comentarios",
    providerCostPer1000: 45900,
    suggestedPricePer1000: 150000,
    customPresets: [10, 20, 50, 100],
    quantities: [
      { id: "tt-c-10", quantity: 10, providerCost: 459, suggestedPrice: 1500, active: true },
      { id: "tt-c-20", quantity: 20, providerCost: 918, suggestedPrice: 3000, active: true },
      { id: "tt-c-50", quantity: 50, providerCost: 2295, suggestedPrice: 7500, active: true },
      { id: "tt-c-100", quantity: 100, providerCost: 4590, suggestedPrice: 15000, active: true }
    ]
  },

  // YOUTUBE
  {
    id: "yt-subscribers",
    socialNetworkId: "youtube",
    name: "Suscriptores",
    providerCostPer1000: 98000,
    suggestedPricePer1000: 200000,
    customPresets: [100, 200, 500, 1000],
    quantities: [
      { id: "yt-s-100", quantity: 100, providerCost: 9800, suggestedPrice: 20000, active: true },
      { id: "yt-s-200", quantity: 200, providerCost: 19600, suggestedPrice: 40000, active: true },
      { id: "yt-s-500", quantity: 500, providerCost: 49000, suggestedPrice: 100000, active: true },
      { id: "yt-s-1000", quantity: 1000, providerCost: 98000, suggestedPrice: 200000, active: true }
    ]
  },
  {
    id: "yt-likes",
    socialNetworkId: "youtube",
    name: "Likes",
    providerCostPer1000: 10000,
    suggestedPricePer1000: 25000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "yt-l-1000", quantity: 1000, providerCost: 10000, suggestedPrice: 25000, active: true },
      { id: "yt-l-2000", quantity: 2000, providerCost: 20000, suggestedPrice: 50000, active: true },
      { id: "yt-l-5000", quantity: 5000, providerCost: 50000, suggestedPrice: 125000, active: true },
      { id: "yt-l-10000", quantity: 10000, providerCost: 100000, suggestedPrice: 250000, active: true }
    ]
  },
  {
    id: "yt-views",
    socialNetworkId: "youtube",
    name: "Vistas",
    providerCostPer1000: 4697,
    suggestedPricePer1000: 12000,
    customPresets: [1000, 2000, 5000, 10000],
    quantities: [
      { id: "yt-v-1000", quantity: 1000, providerCost: 4697, suggestedPrice: 12000, active: true },
      { id: "yt-v-2000", quantity: 2000, providerCost: 9394, suggestedPrice: 24000, active: true },
      { id: "yt-v-5000", quantity: 5000, providerCost: 23485, suggestedPrice: 60000, active: true },
      { id: "yt-v-10000", quantity: 10000, providerCost: 46970, suggestedPrice: 120000, active: true }
    ]
  },
  {
    id: "yt-comments",
    socialNetworkId: "youtube",
    name: "Comentarios",
    providerCostPer1000: 210000,
    suggestedPricePer1000: 600000,
    customPresets: [10, 20, 50, 100],
    quantities: [
      { id: "yt-c-10", quantity: 10, providerCost: 2100, suggestedPrice: 6000, active: true },
      { id: "yt-c-20", quantity: 20, providerCost: 4200, suggestedPrice: 12000, active: true },
      { id: "yt-c-50", quantity: 50, providerCost: 10500, suggestedPrice: 30000, active: true },
      { id: "yt-c-100", quantity: 100, providerCost: 21000, suggestedPrice: 60000, active: true }
    ]
  }
];
