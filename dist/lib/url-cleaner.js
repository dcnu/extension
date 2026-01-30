const TRACKING_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',
    'gclid',
    'dclid',
    'msclkid',
    'twclid',
    'mc_eid',
    'mc_cid',
    'oly_enc_id',
    'oly_anon_id',
    '_ga',
    '_gl',
    '_hsenc',
    '_hsmi',
    'hsCtaTracking',
    'vero_id',
    'ref',
    'ref_',
    'affiliate_id',
    'igshid',
    's_kwcid',
    'trk',
    'trackingId',
];
export function cleanUrl(url) {
    const parsed = new URL(url);
    TRACKING_PARAMS.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
}
