from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.countries.catalog import load_country_catalog


GEOFABRIK_ROOT = "https://download.geofabrik.de"


@dataclass(frozen=True, slots=True)
class VectorCountrySource:
    country_code: str
    country_name: str
    slug: str
    geofabrik_path: str | None
    estimated_pbf_bytes: int | None = None

    @property
    def supported(self) -> bool:
        return self.geofabrik_path is not None

    @property
    def source_url(self) -> str:
        return f"{GEOFABRIK_ROOT}/{self.geofabrik_path}" if self.geofabrik_path else ""

    @property
    def filename(self) -> str:
        return f"{self.slug}.pmtiles"


# Static snapshot of the ISO mappings from Geofabrik's official index-v1.json.
# No user-controlled value is ever interpolated into a remote URL.
_GEOFABRIK_PATHS: dict[str, str] = {
"AD":"europe/andorra-latest.osm.pbf","AE":"asia/gcc-states-latest.osm.pbf","AF":"asia/afghanistan-latest.osm.pbf","AL":"europe/albania-latest.osm.pbf","AM":"asia/armenia-latest.osm.pbf","AO":"africa/angola-latest.osm.pbf","AQ":"antarctica-latest.osm.pbf","AR":"south-america/argentina-latest.osm.pbf","AT":"europe/austria-latest.osm.pbf","AU":"australia-oceania/australia-latest.osm.pbf","AZ":"asia/azerbaijan-latest.osm.pbf","BA":"europe/bosnia-herzegovina-latest.osm.pbf","BD":"asia/bangladesh-latest.osm.pbf","BE":"europe/belgium-latest.osm.pbf","BF":"africa/burkina-faso-latest.osm.pbf","BG":"europe/bulgaria-latest.osm.pbf","BH":"asia/gcc-states-latest.osm.pbf","BI":"africa/burundi-latest.osm.pbf","BJ":"africa/benin-latest.osm.pbf","BO":"south-america/bolivia-latest.osm.pbf","BR":"south-america/brazil-latest.osm.pbf","BS":"central-america/bahamas-latest.osm.pbf","BT":"asia/bhutan-latest.osm.pbf","BW":"africa/botswana-latest.osm.pbf","BY":"europe/belarus-latest.osm.pbf","BZ":"central-america/belize-latest.osm.pbf","CA":"north-america/canada-latest.osm.pbf","CD":"africa/congo-democratic-republic-latest.osm.pbf","CF":"africa/central-african-republic-latest.osm.pbf","CG":"africa/congo-brazzaville-latest.osm.pbf","CH":"europe/switzerland-latest.osm.pbf","CI":"africa/ivory-coast-latest.osm.pbf","CK":"australia-oceania/cook-islands-latest.osm.pbf","CL":"south-america/chile-latest.osm.pbf","CM":"africa/cameroon-latest.osm.pbf","CN":"asia/china-latest.osm.pbf","CO":"south-america/colombia-latest.osm.pbf","CR":"central-america/costa-rica-latest.osm.pbf","CU":"central-america/cuba-latest.osm.pbf","CV":"africa/cape-verde-latest.osm.pbf","CY":"europe/cyprus-latest.osm.pbf","CZ":"europe/czech-republic-latest.osm.pbf","DE":"europe/germany-latest.osm.pbf","DJ":"africa/djibouti-latest.osm.pbf","DK":"europe/denmark-latest.osm.pbf","DO":"central-america/haiti-and-domrep-latest.osm.pbf","DZ":"africa/algeria-latest.osm.pbf","EC":"south-america/ecuador-latest.osm.pbf","EE":"europe/estonia-latest.osm.pbf","EG":"africa/egypt-latest.osm.pbf","ER":"africa/eritrea-latest.osm.pbf","ES":"europe/spain-latest.osm.pbf","ET":"africa/ethiopia-latest.osm.pbf","FI":"europe/finland-latest.osm.pbf","FJ":"australia-oceania/fiji-latest.osm.pbf","FM":"australia-oceania/micronesia-latest.osm.pbf","FO":"europe/faroe-islands-latest.osm.pbf","FR":"europe/france-latest.osm.pbf","GA":"africa/gabon-latest.osm.pbf","GB":"europe/united-kingdom-latest.osm.pbf","GE":"europe/georgia-latest.osm.pbf","GF":"europe/france/guyane-latest.osm.pbf","GH":"africa/ghana-latest.osm.pbf","GL":"north-america/greenland-latest.osm.pbf","GM":"africa/senegal-and-gambia-latest.osm.pbf","GN":"africa/guinea-latest.osm.pbf","GQ":"africa/equatorial-guinea-latest.osm.pbf","GR":"europe/greece-latest.osm.pbf","GT":"central-america/guatemala-latest.osm.pbf","GW":"africa/guinea-bissau-latest.osm.pbf","GY":"south-america/guyana-latest.osm.pbf","HN":"central-america/honduras-latest.osm.pbf","HR":"europe/croatia-latest.osm.pbf","HT":"central-america/haiti-and-domrep-latest.osm.pbf","HU":"europe/hungary-latest.osm.pbf","ID":"asia/indonesia-latest.osm.pbf","IE":"europe/ireland-and-northern-ireland-latest.osm.pbf","IL":"asia/israel-and-palestine-latest.osm.pbf","IN":"asia/india-latest.osm.pbf","IQ":"asia/iraq-latest.osm.pbf","IR":"asia/iran-latest.osm.pbf","IS":"europe/iceland-latest.osm.pbf","IT":"europe/italy-latest.osm.pbf","JM":"central-america/jamaica-latest.osm.pbf","JO":"asia/jordan-latest.osm.pbf","JP":"asia/japan-latest.osm.pbf","KE":"africa/kenya-latest.osm.pbf","KG":"asia/kyrgyzstan-latest.osm.pbf","KH":"asia/cambodia-latest.osm.pbf","KI":"australia-oceania/kiribati-latest.osm.pbf","KP":"asia/north-korea-latest.osm.pbf","KR":"asia/south-korea-latest.osm.pbf","KW":"asia/gcc-states-latest.osm.pbf","KZ":"asia/kazakhstan-latest.osm.pbf","LA":"asia/laos-latest.osm.pbf","LB":"asia/lebanon-latest.osm.pbf","LI":"europe/liechtenstein-latest.osm.pbf","LK":"asia/sri-lanka-latest.osm.pbf","LR":"africa/liberia-latest.osm.pbf","LS":"africa/lesotho-latest.osm.pbf","LT":"europe/lithuania-latest.osm.pbf","LU":"europe/luxembourg-latest.osm.pbf","LV":"europe/latvia-latest.osm.pbf","LY":"africa/libya-latest.osm.pbf","MA":"africa/morocco-latest.osm.pbf","MC":"europe/monaco-latest.osm.pbf","MD":"europe/moldova-latest.osm.pbf","ME":"europe/montenegro-latest.osm.pbf","MG":"africa/madagascar-latest.osm.pbf","MH":"australia-oceania/marshall-islands-latest.osm.pbf","MK":"europe/macedonia-latest.osm.pbf","ML":"africa/mali-latest.osm.pbf","MM":"asia/myanmar-latest.osm.pbf","MN":"asia/mongolia-latest.osm.pbf","MR":"africa/mauritania-latest.osm.pbf","MT":"europe/malta-latest.osm.pbf","MU":"africa/mauritius-latest.osm.pbf","MV":"asia/maldives-latest.osm.pbf","MW":"africa/malawi-latest.osm.pbf","MX":"north-america/mexico-latest.osm.pbf","MY":"asia/malaysia-singapore-brunei-latest.osm.pbf","MZ":"africa/mozambique-latest.osm.pbf","NA":"africa/namibia-latest.osm.pbf","NC":"australia-oceania/new-caledonia-latest.osm.pbf","NE":"africa/niger-latest.osm.pbf","NG":"africa/nigeria-latest.osm.pbf","NI":"central-america/nicaragua-latest.osm.pbf","NL":"europe/netherlands-latest.osm.pbf","NO":"europe/norway-latest.osm.pbf","NP":"asia/nepal-latest.osm.pbf","NR":"australia-oceania/nauru-latest.osm.pbf","NU":"australia-oceania/niue-latest.osm.pbf","NZ":"australia-oceania/new-zealand-latest.osm.pbf","OM":"asia/gcc-states-latest.osm.pbf","PA":"central-america/panama-latest.osm.pbf","PE":"south-america/peru-latest.osm.pbf","PG":"australia-oceania/papua-new-guinea-latest.osm.pbf","PH":"asia/philippines-latest.osm.pbf","PK":"asia/pakistan-latest.osm.pbf","PL":"europe/poland-latest.osm.pbf","PR":"north-america/us/puerto-rico-latest.osm.pbf","PS":"asia/israel-and-palestine-latest.osm.pbf","PT":"europe/portugal-latest.osm.pbf","PW":"australia-oceania/palau-latest.osm.pbf","PY":"south-america/paraguay-latest.osm.pbf","QA":"asia/gcc-states-latest.osm.pbf","RO":"europe/romania-latest.osm.pbf","RS":"europe/serbia-latest.osm.pbf","RU":"russia-latest.osm.pbf","RW":"africa/rwanda-latest.osm.pbf","SB":"australia-oceania/solomon-islands-latest.osm.pbf","SC":"africa/seychelles-latest.osm.pbf","SD":"africa/sudan-latest.osm.pbf","SE":"europe/sweden-latest.osm.pbf","SH":"africa/saint-helena-ascension-and-tristan-da-cunha-latest.osm.pbf","SI":"europe/slovenia-latest.osm.pbf","SK":"europe/slovakia-latest.osm.pbf","SL":"africa/sierra-leone-latest.osm.pbf","SN":"africa/senegal-and-gambia-latest.osm.pbf","SO":"africa/somalia-latest.osm.pbf","SR":"south-america/suriname-latest.osm.pbf","SS":"africa/south-sudan-latest.osm.pbf","ST":"africa/sao-tome-and-principe-latest.osm.pbf","SV":"central-america/el-salvador-latest.osm.pbf","SY":"asia/syria-latest.osm.pbf","SZ":"africa/swaziland-latest.osm.pbf","TD":"africa/chad-latest.osm.pbf","TG":"africa/togo-latest.osm.pbf","TH":"asia/thailand-latest.osm.pbf","TJ":"asia/tajikistan-latest.osm.pbf","TL":"asia/east-timor-latest.osm.pbf","TM":"asia/turkmenistan-latest.osm.pbf","TN":"africa/tunisia-latest.osm.pbf","TO":"australia-oceania/tonga-latest.osm.pbf","TR":"europe/turkey-latest.osm.pbf","TV":"australia-oceania/tuvalu-latest.osm.pbf","TW":"asia/taiwan-latest.osm.pbf","TZ":"africa/tanzania-latest.osm.pbf","UA":"europe/ukraine-latest.osm.pbf","UG":"africa/uganda-latest.osm.pbf","US":"north-america/us-latest.osm.pbf","UY":"south-america/uruguay-latest.osm.pbf","UZ":"asia/uzbekistan-latest.osm.pbf","VE":"south-america/venezuela-latest.osm.pbf","VI":"north-america/us/us-virgin-islands-latest.osm.pbf","VN":"asia/vietnam-latest.osm.pbf","VU":"australia-oceania/vanuatu-latest.osm.pbf","WS":"australia-oceania/samoa-latest.osm.pbf","YE":"asia/yemen-latest.osm.pbf","ZA":"africa/south-africa-latest.osm.pbf","ZM":"africa/zambia-latest.osm.pbf","ZW":"africa/zimbabwe-latest.osm.pbf"}


def _source_slug(code: str, path: str | None, duplicates: Counter[str]) -> str:
    if path is None:
        return code.lower()
    stem = PurePosixPath(path).name.removesuffix("-latest.osm.pbf")
    return f"{stem}-{code.lower()}" if duplicates[path] > 1 else stem


_PATH_COUNTS = Counter(_GEOFABRIK_PATHS.values())
VECTOR_COUNTRY_CATALOG = {
    str(country["iso_alpha2"]): VectorCountrySource(
        country_code=str(country["iso_alpha2"]),
        country_name=str(country["name"]),
        slug=_source_slug(str(country["iso_alpha2"]), _GEOFABRIK_PATHS.get(str(country["iso_alpha2"])), _PATH_COUNTS),
        geofabrik_path=_GEOFABRIK_PATHS.get(str(country["iso_alpha2"])),
    )
    for country in load_country_catalog()
}


def vector_country_source(country_code: str) -> VectorCountrySource | None:
    source = VECTOR_COUNTRY_CATALOG.get(country_code.strip().upper())
    return source if source and source.supported else None
