export interface TZOption {
  value: string;
  label: string;
}

export const TIMEZONES: TZOption[] = [
  { value: 'UTC',                              label: 'UTC' },
  // Americas
  { value: 'America/New_York',                 label: 'New York [EST/EDT]' },
  { value: 'America/Chicago',                  label: 'Chicago [CST/CDT]' },
  { value: 'America/Denver',                   label: 'Denver [MST/MDT]' },
  { value: 'America/Phoenix',                  label: 'Phoenix [MST]' },
  { value: 'America/Los_Angeles',              label: 'Los Angeles [PST/PDT]' },
  { value: 'America/Anchorage',                label: 'Anchorage [AKST/AKDT]' },
  { value: 'Pacific/Honolulu',                 label: 'Honolulu [HST]' },
  { value: 'America/Toronto',                  label: 'Toronto [EST/EDT]' },
  { value: 'America/Vancouver',                label: 'Vancouver [PST/PDT]' },
  { value: 'America/Winnipeg',                 label: 'Winnipeg [CST/CDT]' },
  { value: 'America/Halifax',                  label: 'Halifax [AST/ADT]' },
  { value: 'America/St_Johns',                 label: "St. John's [NST/NDT]" },
  { value: 'America/Mexico_City',              label: 'Mexico City [CST/CDT]' },
  { value: 'America/Bogota',                   label: 'Bogota [COT]' },
  { value: 'America/Lima',                     label: 'Lima [PET]' },
  { value: 'America/Santiago',                 label: 'Santiago [CLT/CLST]' },
  { value: 'America/Sao_Paulo',                label: 'São Paulo [BRT/BRST]' },
  { value: 'America/Argentina/Buenos_Aires',   label: 'Buenos Aires [ART]' },
  { value: 'America/Caracas',                  label: 'Caracas [VET]' },
  { value: 'America/Guyana',                   label: 'Georgetown [GYT]' },
  { value: 'America/La_Paz',                   label: 'La Paz [BOT]' },
  { value: 'America/Panama',                   label: 'Panama [EST]' },
  { value: 'America/Costa_Rica',               label: 'San José [CST]' },
  { value: 'America/Managua',                  label: 'Managua [CST]' },
  { value: 'America/Tegucigalpa',              label: 'Tegucigalpa [CST]' },
  // Europe
  { value: 'Europe/London',                    label: 'London [GMT/BST]' },
  { value: 'Europe/Dublin',                    label: 'Dublin [GMT/IST]' },
  { value: 'Europe/Lisbon',                    label: 'Lisbon [WET/WEST]' },
  { value: 'Europe/Paris',                     label: 'Paris [CET/CEST]' },
  { value: 'Europe/Berlin',                    label: 'Berlin [CET/CEST]' },
  { value: 'Europe/Amsterdam',                 label: 'Amsterdam [CET/CEST]' },
  { value: 'Europe/Brussels',                  label: 'Brussels [CET/CEST]' },
  { value: 'Europe/Madrid',                    label: 'Madrid [CET/CEST]' },
  { value: 'Europe/Rome',                      label: 'Rome [CET/CEST]' },
  { value: 'Europe/Zurich',                    label: 'Zurich [CET/CEST]' },
  { value: 'Europe/Vienna',                    label: 'Vienna [CET/CEST]' },
  { value: 'Europe/Warsaw',                    label: 'Warsaw [CET/CEST]' },
  { value: 'Europe/Stockholm',                 label: 'Stockholm [CET/CEST]' },
  { value: 'Europe/Oslo',                      label: 'Oslo [CET/CEST]' },
  { value: 'Europe/Copenhagen',                label: 'Copenhagen [CET/CEST]' },
  { value: 'Europe/Helsinki',                  label: 'Helsinki [EET/EEST]' },
  { value: 'Europe/Athens',                    label: 'Athens [EET/EEST]' },
  { value: 'Europe/Istanbul',                  label: 'Istanbul [TRT]' },
  { value: 'Europe/Moscow',                    label: 'Moscow [MSK]' },
  { value: 'Europe/Kiev',                      label: 'Kyiv [EET/EEST]' },
  { value: 'Europe/Bucharest',                 label: 'Bucharest [EET/EEST]' },
  { value: 'Europe/Prague',                    label: 'Prague [CET/CEST]' },
  { value: 'Europe/Budapest',                  label: 'Budapest [CET/CEST]' },
  { value: 'Europe/Minsk',                     label: 'Minsk [FET]' },
  { value: 'Europe/Riga',                      label: 'Riga [EET/EEST]' },
  { value: 'Europe/Tallinn',                   label: 'Tallinn [EET/EEST]' },
  { value: 'Europe/Vilnius',                   label: 'Vilnius [EET/EEST]' },
  // Africa
  { value: 'Africa/Cairo',                     label: 'Cairo [EET]' },
  { value: 'Africa/Nairobi',                   label: 'Nairobi [EAT]' },
  { value: 'Africa/Lagos',                     label: 'Lagos [WAT]' },
  { value: 'Africa/Johannesburg',              label: 'Johannesburg [SAST]' },
  { value: 'Africa/Casablanca',                label: 'Casablanca [WET/WEST]' },
  { value: 'Africa/Accra',                     label: 'Accra [GMT]' },
  { value: 'Africa/Addis_Ababa',               label: 'Addis Ababa [EAT]' },
  { value: 'Africa/Dar_es_Salaam',             label: 'Dar es Salaam [EAT]' },
  { value: 'Africa/Khartoum',                  label: 'Khartoum [CAT]' },
  { value: 'Africa/Tunis',                     label: 'Tunis [CET]' },
  { value: 'Africa/Algiers',                   label: 'Algiers [CET]' },
  { value: 'Africa/Abidjan',                   label: 'Abidjan [GMT]' },
  // Middle East
  { value: 'Asia/Dubai',                       label: 'Dubai [GST]' },
  { value: 'Asia/Riyadh',                      label: 'Riyadh [AST]' },
  { value: 'Asia/Baghdad',                     label: 'Baghdad [AST]' },
  { value: 'Asia/Tehran',                      label: 'Tehran [IRST/IRDT]' },
  { value: 'Asia/Jerusalem',                   label: 'Jerusalem [IST/IDT]' },
  { value: 'Asia/Kuwait',                      label: 'Kuwait [AST]' },
  { value: 'Asia/Qatar',                       label: 'Doha [AST]' },
  { value: 'Asia/Muscat',                      label: 'Muscat [GST]' },
  { value: 'Asia/Beirut',                      label: 'Beirut [EET/EEST]' },
  { value: 'Asia/Amman',                       label: 'Amman [EET/EEST]' },
  { value: 'Asia/Nicosia',                     label: 'Nicosia [EET/EEST]' },
  // South / Central Asia
  { value: 'Asia/Karachi',                     label: 'Karachi [PKT]' },
  { value: 'Asia/Kolkata',                     label: 'Mumbai / Delhi [IST]' },
  { value: 'Asia/Colombo',                     label: 'Colombo [IST]' },
  { value: 'Asia/Dhaka',                       label: 'Dhaka [BST]' },
  { value: 'Asia/Kathmandu',                   label: 'Kathmandu [NPT]' },
  { value: 'Asia/Kabul',                       label: 'Kabul [AFT]' },
  { value: 'Asia/Tashkent',                    label: 'Tashkent [UZT]' },
  { value: 'Asia/Almaty',                      label: 'Almaty [ALMT]' },
  { value: 'Asia/Yekaterinburg',               label: 'Yekaterinburg [YEKT]' },
  // East & SE Asia
  { value: 'Asia/Yangon',                      label: 'Yangon [MMT]' },
  { value: 'Asia/Bangkok',                     label: 'Bangkok [ICT]' },
  { value: 'Asia/Ho_Chi_Minh',                 label: 'Ho Chi Minh City [ICT]' },
  { value: 'Asia/Jakarta',                     label: 'Jakarta [WIB]' },
  { value: 'Asia/Kuala_Lumpur',                label: 'Kuala Lumpur [MYT]' },
  { value: 'Asia/Singapore',                   label: 'Singapore [SGT]' },
  { value: 'Asia/Manila',                      label: 'Manila [PHT]' },
  { value: 'Asia/Hong_Kong',                   label: 'Hong Kong [HKT]' },
  { value: 'Asia/Taipei',                      label: 'Taipei [CST]' },
  { value: 'Asia/Shanghai',                    label: 'Shanghai / Beijing [CST]' },
  { value: 'Asia/Seoul',                       label: 'Seoul [KST]' },
  { value: 'Asia/Tokyo',                       label: 'Tokyo [JST]' },
  { value: 'Asia/Ulaanbaatar',                 label: 'Ulaanbaatar [ULAT]' },
  // Pacific / Australia
  { value: 'Australia/Perth',                  label: 'Perth [AWST]' },
  { value: 'Australia/Darwin',                 label: 'Darwin [ACST]' },
  { value: 'Australia/Adelaide',               label: 'Adelaide [ACST/ACDT]' },
  { value: 'Australia/Brisbane',               label: 'Brisbane [AEST]' },
  { value: 'Australia/Sydney',                 label: 'Sydney [AEST/AEDT]' },
  { value: 'Australia/Melbourne',              label: 'Melbourne [AEST/AEDT]' },
  { value: 'Australia/Hobart',                 label: 'Hobart [AEST/AEDT]' },
  { value: 'Pacific/Auckland',                 label: 'Auckland [NZST/NZDT]' },
  { value: 'Pacific/Fiji',                     label: 'Fiji [FJT/FJST]' },
  { value: 'Pacific/Guam',                     label: 'Guam [ChST]' },
  { value: 'Pacific/Tahiti',                   label: 'Tahiti [TAHT]' },
  { value: 'Pacific/Port_Moresby',             label: 'Port Moresby [PGT]' },
  { value: 'Pacific/Noumea',                   label: 'Noumea [NCT]' },
];

export function getTzLabel(value: string): string {
  return TIMEZONES.find(t => t.value === value)?.label ?? value;
}

export function getTzAbbr(value: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: value, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value ?? value;
  } catch {
    return value;
  }
}
