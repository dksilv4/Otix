/**
 * Official Counter-Strike 2 Weapon, Equipment & Skin Imagery Registry.
 * Source: ByMykel CSGO-API (parsed from official CS2 game files and Steam Economy CDN).
 * Endpoint: https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/
 */

export interface Cs2ItemMetadata {
  name: string
  image: string
  category?: string
  rarityColor?: string
}

export const CS2_ITEMS_REGISTRY: Record<string, Cs2ItemMetadata> = {
  "desert eagle": {
    "name": "Desert Eagle",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnk-CNc4_fgOfA8cfGRDTfGku13seI4Fyq2wUQm5DjWzo38IH3BO1N2W5MmTe5etw74zINmLLSKdA",
    "category": "Pistols"
  },
  "dual berettas": {
    "name": "Dual Berettas",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnl8StP6ryvOqJpJqjACjbBkb93srg-Fn7ilBhysWXSyNarJSqUZlIpCMclTbMCrFDmxYRwJ9Kk",
    "category": "Pistols"
  },
  "five-seven": {
    "name": "Five-SeveN",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnm9DRe_Pe4baojePHHWz7GwL4jsbVvTHnilE1w5WrVzo39JH6QOFUnC8RxROMN4ESwlMqnab24YkBbtQ",
    "category": "Pistols"
  },
  "glock-18": {
    "name": "Glock-18",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnn8S1Y5Lz9O_M5d_LHDz6WmOp04-U8THmwzU0l6ziDyd__IC3DO1IgXJJwE7NfrFDmxU9v5GXb",
    "category": "Pistols"
  },
  "ak-47": {
    "name": "AK-47",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnh9nYMoaCvMfxudKGVC2bIwLku5bFsHn2xzU1w4W_Tm9-ucn2eaQZxWcYmR-IU8k7vea-fOvM",
    "category": "Rifles"
  },
  "aug": {
    "name": "AUG",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnh6CUV7ff8PP08eanED2LHlLh06ec-TnjmkUUmsGXRn4n8cimTPVB0XsR1RPlK7Ee4GsImgw",
    "category": "Rifles"
  },
  "awp": {
    "name": "AWP",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnh6jIVtqr4PqBoI_ORVjXFkeguseMwGXGwwUV_4GmHyd2qdH-WbFAmApsiQPlK7EcMn7y-CQ",
    "category": "Rifles"
  },
  "famas": {
    "name": "FAMAS",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnm_C9a_Lz4OvY8dKLGXDKRmOtw5ORrTni3lhl06mqAn4ypJHvBalQlC8AhE-ICrFDmxTHPFtPP",
    "category": "Rifles"
  },
  "g3sg1": {
    "name": "G3SG1",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnnrjFcvrz4P_U6efbAWT7BmOou57AxHHjjx0gk4zjQztqtJC7FaVUoW5okTLQNrFDmxakCozSV",
    "category": "Rifles"
  },
  "galil ar": {
    "name": "Galil AR",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnn_C5S4_O8JvZrIaPKV2ORx7d3trg7Gnjmlxl04WTTyoyqeXKUPFVzCsN1FuMJuxam0oqwr0aqT-w",
    "category": "Rifles"
  },
  "m249": {
    "name": "M249",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKntr3YCoaarbfc_IvHDWWLClb8g5OA7F3y1l0xw6juBzdeoJX6fZ1IoWcciQ-UU8k7vtOr9c-I",
    "category": "Heavy"
  },
  "m4a4": {
    "name": "M4A4",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKntqSMKofH_O_Y-JfSVV2XBkLolsbZvTCqxx0sk4DjUnNipdSiQagcgXJQlRLEU8k7vIDSSpqI",
    "category": "Rifles"
  },
  "mac-10": {
    "name": "MAC-10",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_mac10_png.png",
    "category": "SMGs"
  },
  "p90": {
    "name": "P90",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnwpHIVvfOsPfI9dqDCWDDGkb4j5OU_Fy_kx0l1tj6DnoqseC2TP1cpAsF2QPlK7EcMYXqtDg",
    "category": "SMGs"
  },
  "mp5-sd": {
    "name": "MP5-SD",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_mp5sd_png.png",
    "category": "SMGs"
  },
  "ump-45": {
    "name": "UMP-45",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKn18DIPurz6MPducqDGCDPIw7l05LA7SXyylkh25z-Dm9agJHKSZgciDZt3F7JerFDmxeILsNGi",
    "category": "SMGs"
  },
  "xm1014": {
    "name": "XM1014",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_xm1014_png.png",
    "category": "Heavy"
  },
  "pp-bizon": {
    "name": "PP-Bizon",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKni9DhU4bz-PKZocPTBW2GWlbZw4bM7SS2xwER1smSEnIv6dS_GbFBxDJd0RLFbrFDmxaLGO5J-",
    "category": "SMGs"
  },
  "mag-7": {
    "name": "MAG-7",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnt_CUMoav3MP1oeanBXWLAmeoitbk-HHrjl0hztW7Xy4n7dirDag4hXJB4EeUU8k7vG_ZoUEk",
    "category": "Heavy"
  },
  "negev": {
    "name": "Negev",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnu-CVe-bz3P6I1caTGDzTFk7gh5rg6Tn3rkBwm4zjSwo3_Ii-fZgIjA8dwELFZrFDmxWhBRARX",
    "category": "Heavy"
  },
  "sawed-off": {
    "name": "Sawed-Off",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnz_DVe6_2obuo_JqHACzaSk-1wtrMwTi3nkUly6m-ByYr4Jy2fP1cgA8dxFLRfu0LqjJS5YC4vtNQk",
    "category": "Heavy"
  },
  "tec-9": {
    "name": "Tec-9",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKn0-CECofb2MKY9IvPGWjPAkrwi5Lk4Tn3nzUwlsGnVzI6pdymQbVAjW8d0F-IU8k7vdMx23Ho",
    "category": "Pistols"
  },
  "zeus x27": {
    "name": "Zeus x27",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKn0_DFe_bz6PKI4caTCDzHCwrkj57U6FnHik0l04mXVw4yhJCiRaVImW8dzTeRcrFDmxd8qNG47",
    "category": "Equipment"
  },
  "p2000": {
    "name": "P2000",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKno9jIJv6L-Jqc_cKjEWDDDlLx3trVrH3qykEtz4TjQno6td3uVbVRyWZR2EbEKtRCm0oqwKXhPxN4",
    "category": "Pistols"
  },
  "mp7": {
    "name": "MP7",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnt7XUVvfOoPqA1eKHEVjXFlr0ituM_SnqwwR9w4mXVyIn6dnKRblV1D5AhTPlK7EelyO1yEg",
    "category": "SMGs"
  },
  "mp9": {
    "name": "MP9",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnt7XsVv6T9OvE9dKLKCD_Ex74h5bY6Tnrgl0hzt2rXm4qseXyWaAMgWJJ2EflK7Ec0i602wg",
    "category": "SMGs"
  },
  "nova": {
    "name": "Nova",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_nova_png.png",
    "category": "Heavy"
  },
  "p250": {
    "name": "P250",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnwr3cLoaf4avNvJqKXXmKUlrp0s-U9HCvgw0V05WSDw96pIC6VOw92X8QkROAU8k7vNwsvFQ4",
    "category": "Pistols"
  },
  "scar-20": {
    "name": "SCAR-20",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnz_iNJvaLgbqY_JqbKV2TExL11s7JoGnjkl05-4TvUw96vdHiQOwZ1AsMiQuMOtQ74zINGfpXf5Q",
    "category": "Rifles"
  },
  "sg 553": {
    "name": "SG 553",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_sg556_png.png",
    "category": "Rifles"
  },
  "ssg 08": {
    "name": "SSG 08",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnz7iULt7z2MPY1eaWVCDHGlrgksuQ_HS3lxhkh4m-Gm9b6ICjCPQ4hDMF3EOJerFDmxXJ24aAg",
    "category": "Rifles"
  },
  "knife": {
    "name": "Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s26JqJodqWRXjXBlLt05bM7TX21kx91527RnN-teXzFPQYpD5ckQbYM4BCm0oqwrVaqAqg",
    "category": "Knives"
  },
  "flashbang": {
    "name": "Flashbang",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_flashbang_png.png",
    "category": "Grenades"
  },
  "high explosive grenade": {
    "name": "High Explosive Grenade",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_hegrenade_png.png",
    "category": "Grenades"
  },
  "smoke grenade": {
    "name": "Smoke Grenade",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_smokegrenade_png.png",
    "category": "Grenades"
  },
  "molotov": {
    "name": "Molotov",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_molotov_png.png",
    "category": "Grenades"
  },
  "decoy grenade": {
    "name": "Decoy Grenade",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_decoy_png.png",
    "category": "Grenades"
  },
  "incendiary grenade": {
    "name": "Incendiary Grenade",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_incgrenade_png.png",
    "category": "Grenades"
  },
  "c4 explosive": {
    "name": "C4 Explosive",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnjqWwLvfOoavw8IvTCV2bEle1w6Lk-TSq2k0x25jiBzN_9dXqVaQ91W5AkW6dU5WnQha4l",
    "category": "C4"
  },
  "medi-shot": {
    "name": "Medi-Shot",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/weapon_healthshot_png.png",
    "category": "Equipment"
  },
  "m4a1-s": {
    "name": "M4A1-S",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKntqSMK0OGnZKFjI_WBQD_Cleh0teA_F37qkERy52rWm9yhdynGblMgD5AkQrZeuhXtkt3iMOv8p1uJZpwq8Vo",
    "category": "Rifles"
  },
  "usp-s": {
    "name": "USP-S",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKn17jJk_PuibapuJeLdWGLFwL8i4eVsFiqxxUt34jmHnoysJ3qVOAYgCJZwQrRb5EPul4XlYvSiuVIHgy4Xvg",
    "category": "Pistols"
  },
  "cz75-auto": {
    "name": "CZ75-Auto",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnj53UO7ryvaac0dKiVW2XBlrwmsuA6GH3hkE9062qEz9aoeCmVawchW8dwEe4MrFDmxWPDR_Ga",
    "category": "Pistols"
  },
  "r8 revolver": {
    "name": "R8 Revolver",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKny-DRU4-Sreuo8cvTLCzKRmbkk4ONtGijilk8k4znWy9v8JCiUaQIiWZpyQ-AJtEa7jJS5YM17OTN5",
    "category": "Pistols"
  },
  "bayonet": {
    "name": "Bayonet",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKni_DtU4fe6Jv07IfTDDT_JkL4htLI7HCvmwE9z42_Vzov4ci2Wa1IgWMN3R7IMuxCm0oqwYUAZNBA",
    "category": "Knives"
  },
  "classic knife": {
    "name": "Classic Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2te7cjd6HHXmHBxep157VtTi_rzUR-5WiHnt39c3_EZg4pW5UjQOZbsBCxw8qnab32FBG7RA",
    "category": "Knives"
  },
  "flip knife": {
    "name": "Flip Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2oZK19bqjKVjbDkbtwtbU4S3jhwElw4DvVzomhd3_CblV1CZd2TO5f4RG4lID5d7S15Y9TpQQ",
    "category": "Knives"
  },
  "gut knife": {
    "name": "Gut Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2pfbAjd6TAXDSSkeh3trdtTCy1zUV2t2vTyoyrIHzDalAgCsN1ROcO40O6wMqnab0rKy1qHw",
    "category": "Knives"
  },
  "karambit": {
    "name": "Karambit",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2labZsLfKaGinEx-0u5LhqGHrjlElz52jRmN2sd3yfb1NzWZVwRbNeu0S5k9WxMuvh-UWA3ObnwJvj",
    "category": "Knives"
  },
  "m9 bayonet": {
    "name": "M9 Bayonet",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2jMZtvIemcAGKEj7ojtOIwSnrrkEt25WiEw438cXuUaQB0WcBxFrUItxa6lNezMOKzsVPAy9USYWigJ8Q",
    "category": "Knives"
  },
  "huntsman knife": {
    "name": "Huntsman Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s26aad5KfOSAimVlugu47U5HSrmzEp14zncz4ygICiealIiAsF2EOdYtkTpwNXuYbjk-UWA3JpY_ZDP",
    "category": "Knives"
  },
  "falchion knife": {
    "name": "Falchion Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2oaahuKPmcACmSlL4u5uVqG37klhh24DnUytaqJXKQbgcmX5RyF-4Puha8xofmZejg-UWA3FLkEz9H",
    "category": "Knives"
  },
  "bowie knife": {
    "name": "Bowie Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29fbZ7KeaSAliSzvl_ta88TX61xExyt2nTz9eveHjEPQRzXMcjFuYIuhHtkIKyNLnmtACLg4sX02yg2XbF4Kcv",
    "category": "Knives"
  },
  "butterfly knife": {
    "name": "Butterfly Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2sfbB5JeKVAn7elO8l6LRoF3_hzBsmtWSDzt-rcy3BP1AnXsR4FOJZskG6xtDkM7627xue1dy94mNpNQ",
    "category": "Knives"
  },
  "shadow daggers": {
    "name": "Shadow Daggers",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2-fbdlbvXKWWXIlbh15bdrTnvmwkt34z_Qz46hdnjFbAIkCJdzR-Zctxi5kNb5d7S1mgn3amY",
    "category": "Knives"
  },
  "paracord knife": {
    "name": "Paracord Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2tZ7ZpbqWRXmWTmbsm5bU5TXu3lkR_5j_Swor8JC_BPFVxWJd1FuID4RW7w9b5d7S1z-U4Rao",
    "category": "Knives"
  },
  "survival knife": {
    "name": "Survival Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2taapkM77CDzbIlrsms-NsHHGxzUwj5G6En4yuIy_BbQAjC5VxQLRc5hm8x4HvKaq8sEukLuHu",
    "category": "Knives"
  },
  "ursus knife": {
    "name": "Ursus Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s27erd4M77AXWWWx7h3tOA5SyvilEkj5WuGw42qc3zEOg4iDJEjQu9b4xa6w4DgKaq8sDVgNcPY",
    "category": "Knives"
  },
  "navaja knife": {
    "name": "Navaja Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2pcbR-Oc-ZD2SbyuB_tuQnGXu1kBxw62_dwtird3qXZwQgXJV0E-4PtESxl4ezYr6x4FaMjI4UyzK-0H1iy36efQ",
    "category": "Knives"
  },
  "nomad knife": {
    "name": "Nomad Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2hfbBpL_-BQDPEw-hz57cxTnCxkEh_5jnVzor8dymXbgAiAsFyEOEMsBW8l9O1Ne38p1uJmh0Kkm0",
    "category": "Knives"
  },
  "stiletto knife": {
    "name": "Stiletto Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29fK1hJeSHASnCmO8v4bc_HCjilkkismTWyNutciqealMhDsR5F7MM4UWwlYC1Zr7n-UWA3E6ZCYCt",
    "category": "Knives"
  },
  "talon knife": {
    "name": "Talon Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s25YaBiN_2SBWKCj7ghsrRrTHDnzB8h4mTRw9iudC_DPFVyCsF3R-Zc4xK_ldXgNb7qsgDAy9USS1NPX9M",
    "category": "Knives"
  },
  "skeleton knife": {
    "name": "Skeleton Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29Y6FhJeScACnDkL8j6LU8GS3mwUh24G-Bno2tIymeblMgC5R3F-ECsBK6k4XuN-Lh-UWA3P3GyEv9",
    "category": "Knives"
  },
  "kukri knife": {
    "name": "Kukri Knife",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2lfa9_Kb6VXmPGwuogsbNvSyi3zR4jsTnQztyqdS6QP1IoXpoiEeAC5Be5l9CxKaq8sIvgdE5J",
    "category": "Knives"
  },
  "default t gloves": {
    "name": "Default T Gloves",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/t_gloves_png.png",
    "category": "Gloves"
  },
  "default ct gloves": {
    "name": "Default CT Gloves",
    "image": "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapons/base_weapons/ct_gloves_png.png",
    "category": "Gloves"
  },
  "★ specialist gloves | fade": {
    "name": "★ Specialist Gloves | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk71ruQBH4jYLf-i5U-fe9V7d9JfOaD2uZ0vpJtuBtSha_nBovp3PQy42sdX6eagIjW5AlQOVetBXuk92xNLvg4gOMjd5AmC2ointB53w__a9cBqntWBk3",
    "category": "Gloves",
    "rarityColor": "#eb4b4b"
  },
  "★ specialist gloves | marble fade": {
    "name": "★ Specialist Gloves | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk71ruQBH4jYLf-i5U-fe9V7d9JfOaD2uZ0vpJveB7TSW2qhsmtzi6lob-KT-JOlUhC8Z2QOUDsxa6xIe0N7nk5ALWjolMm3793SxAvX0_5-sBUaNz-rqX0V-xn3he8w",
    "category": "Gloves",
    "rarityColor": "#eb4b4b"
  },
  "★ hydra gloves | case hardened": {
    "name": "★ Hydra Gloves | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOlo_k7yNk6P6hfqF-H_KfAWiUyeFjvuVWRzC3hxwYsDyWn7DxIDnDO1h1Xv0sHLBS9g7ul9zmMbi35FHYgolMmSj9jS8fvC5jte9RAqctqKCC2QHBYrU64MMCOr_5GlPhveuZ",
    "category": "Gloves",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | inheritance": {
    "name": "AK-47 | Inheritance",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiNQ0OKheqdoLPGaAFicyOl-pK8xGH_nwUt1sGrSz9ivcHKQOAcjXMYkRu5Yuxe4lYCyZOq25VSM2oMT02yg2UxBSEgA",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | case hardened": {
    "name": "AK-47 | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiNK0P2nZKFpH_yaCW-Ej7sk5bE8Sn-2lEpz4zndzoyvdHuUPwFzWZYiE7EK4Bi4k9TlY-y24FbAy9USGSiZd5Q",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "ak-47 | asiimov": {
    "name": "AK-47 | Asiimov",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSIeOaB2qf19F6ueZhW2e2wEt-t2jcytf6dymSO1JxA5oiRecLsRa5kIfkYr-241aLgotHz3-rkGoXuUp8oX57",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | redline": {
    "name": "AK-47 | Redline",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSI_-RHGavzedxuPUnFniykEtzsWWBzoyuIiifaAchDZUjTOZe4RC_w4buM-6z7wzbgokUyzK-0H08hRGDMA",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "ak-47 | nightwish": {
    "name": "AK-47 | Nightwish",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSLvmUBnOHyP1-j-1gSCGn20glt2nXnt78cnKUbwN2XJp2R-ZbuxHqlNXlMLiw5AHc3toWnCur23hXrnE8p0T2bx4",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | vulcan": {
    "name": "AK-47 | Vulcan",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSMuWRDGKC_uJ_t-l9AXCxxEh14zjTztivci2ePQZ2W8NzTecD4BKwloLiYeqxtAOIj9gUyyngznQeF7I6QE8",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | head shot": {
    "name": "AK-47 | Head Shot",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlV6xoIfSsHW-f1dF-v-1mcCW6khUz_TzRnNigd3-SOg4lAsF1QOQN4xS4wdHnMu-0swaMjIxExSSoiyof6ih1o7FVGHIdVhw",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | fire serpent": {
    "name": "AK-47 | Fire Serpent",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0PSneqF-JeKDC2mE_u995LZWTTuygxIYvzSCkpu3cnvFPQB2DpUkROFY4Rntw93lP7i241DbiI1BxSuviHlKunk_6-sHU71lpPMTRLyP4Q",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "ak-47 | slate": {
    "name": "AK-47 | Slate",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiVI0POlPPNSMOKcCGKD0ud5vuBlcCW6khUz_W3Sytb4cCqTOFUpWJtzTOUD5hPsw9a0Yrnrs1SK3ooXzy6shilM5311o7FVYrIufmI",
    "category": "Rifles",
    "rarityColor": "#8847ff"
  },
  "aug | amber fade": {
    "name": "AUG | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf_CNk6fOqbZtgJeSSAmuZwtF6ueZhW2fizUlwsmuEytmvJHzGaQJyXMclEbYCuhPtkdHmPrvqsVaL3osTmyj6kGoXuZFFysy6",
    "category": "Rifles",
    "rarityColor": "#4b69ff"
  },
  "awp | fade": {
    "name": "AWP | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_CNk7uW-V6JsJPWsAm6Xyfo45-c5GXDnwB534DuEwtuoIHOfaAYiAsYjF-QItUaxmoC0MO_h5ALcjJUFk3sEzfdk4w",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | printstream": {
    "name": "AWP | Printstream",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_DVL0OK8Yap5M-SBC2ad_uJ_t-l9AX_qlk4k5GyAzo6ocC-QZgZxX8AjEbZY5xnrxtPjM7vnsgGIj9oTmXngznQeg3pfcPs",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | chrome cannon": {
    "name": "AWP | Chrome Cannon",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_DVL0OarZbRoMvWXMWuZxuZi_uM6SXngxR5-smTXw4ugIi6RbVcpXsN1ELUDtxPrktOyNL7h4g2P2tpbjXKpKIbjbD4",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | asiimov": {
    "name": "AWP | Asiimov",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6V-Kf2cGFidxOp_pewnF3nhxEt0sGnSzN76dH3GOg9xC8FyEORftRe-x9PuYurq71bW3d8UnjK-0H0YSTpMGQ",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | redline": {
    "name": "AWP | Redline",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6diIuKSMWuZxuZi_rUxHS3lzUwm5DjWy976dSiRagd1WJB1RLQP4RK-mtazM-3itQeL2INbjXKpw2eVIZ0",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "awp | hyper beast": {
    "name": "AWP | Hyper Beast",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6x0MPWBMWWVwP1ij-1gSCGn20pxtm_WzNuoeHKeaFAnCZUiTe5bt0HqxofmZOrm5Q2IjoMQzS_5iShXrnE8NzWs__c",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | neo-noir": {
    "name": "AWP | Neo-Noir",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6poL_6cB3WvzedxuPUnHirrxR4l423SyI39I3KXPwdxWZclQeNZ5EXskYfnNeyw71OMi9lNzDK-0H3r66pOTw",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "awp | dragon lore": {
    "name": "AWP | Dragon Lore",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqYaF7IfysCnWRxuF4j-B-Xxa_nBovp3Pdwtj9cC_GaAd0DZdwQu9fuhS4kNy0NePntVTbjYpCyyT_3CgY5i9j_a9cBkcCWUKV",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "★ bayonet | fade": {
    "name": "★ Bayonet | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0POvV6JsJPWsAm6Xyfo45-BrHniwzUh24jjVm4qgInnCOA4mDscmEeVcsBXtkN22P-yx5waNg5UFk3tAoG85FQ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bayonet | doppler": {
    "name": "★ Bayonet | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0POjV7dsMOCbB3WV_uN3ouNlSiCpkBkYvzSCkpu3d3_FaFUnXpRwEO4O50G5xoW1Y7zn5wLe3oxBxHn6jiwf7XposO8LBb1lpPPeBvHrwA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bayonet | gamma doppler": {
    "name": "★ Bayonet | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0POjV6NsLf2SMWOf0f56tfNWXyGyhhhzjDGMnYftb3_CO1ciCJYhEOID4UW_kNayPuPktVbZg9pBmC_8jC5PvStp5L1QWPY7uvqA1BNTDgI",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bayonet | marble fade": {
    "name": "★ Bayonet | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0POjV6lsMvKfC1iWwOpzj-1gSCGn2xhysWrTn42rdH2SawQnDccjE-ELsxa-mtTjMejr7wXZgoxFn3n2hnhXrnE8oMvxYMA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bayonet | case hardened": {
    "name": "★ Bayonet | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0PO_V6tkLPWXMWuZxuZi_uRrSXDlzUtw4WTRwtj4eX6XPAd0XsEiROcNthm-w4HhP-Pq7waKiItbjXKppDMdu0I",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "desert eagle | heat treated": {
    "name": "Desert Eagle | Heat Treated",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7uORbKFsJ_yWMWSR0utJuOB7Syy9kBkY4QKJk4jxNWXGbQZ0CZpyTeBf4xO4m9y1Nuy05wHYg4lNySWr3C1Luyhu4LkKA6As5OSJ2JAJXn6j",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "desert eagle | kumicho dragon": {
    "name": "Desert Eagle | Kumicho Dragon",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7uORbKF-JeKHC2aXzetJu_RkRiq7mhk1sjqKlLD1KCzPKhh0CcBwQLVe5BHrloKyZOnr5w3XiYhDnC39iCpK7X1psrlUWaFw8qXekUifZlV_fDVZ",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "desert eagle | printstream": {
    "name": "Desert Eagle | Printstream",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7OeRbKFsJ8-DHG6e1f1iouRoQha_nBovp3OGmdeqInyVP1V0XsYlRbEI50a5wNyzZr605AyI3t5MmCSohylAuC89_a9cBoMY9UkV",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "desert eagle | code red": {
    "name": "Desert Eagle | Code Red",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk6OGRbKFsJ_yWMWaXxvxzo_JmXRa_nBovp3PRmNj4c3mTb1RxC5cjF-EItRnrlNzkYrnk5gaI3Y0UmyX52H9K7ixs_a9cBsGEcOCn",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "five-seven | heat treated": {
    "name": "Five-SeveN | Heat Treated",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRabVSI_GAC1iYwPxyte9sSxa1nAsioDiTn4HGLSLANkI-D5pxEbIDu0btkoXlNuO24wDZ2YhDmH7923tI7ClrsblWAqMj-KPRiBaBb-NawNZy0w",
    "category": "Pistols",
    "rarityColor": "#8847ff"
  },
  "five-seven | case hardened": {
    "name": "Five-SeveN | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRabVSL_mfC2OvzedxuPUnH3C1kRsi4jiAw4qtdXjCO1V2WcZxF-EO5xLsxtHmMeKw5g3fit4TnDK-0H1W4XC76Q",
    "category": "Pistols",
    "rarityColor": "#8847ff"
  },
  "five-seven | hyper beast": {
    "name": "Five-SeveN | Hyper Beast",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRa7FSJvmFC3SV1-t4j-lwXyyhlxgmoCm6lob-KT-JO1QgWZVyELEPu0W4l9KzYbzn5Fbf3YkTzn_8hihIvXxtsOoFUKYirLqX0V_f6-eqCw",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "galil ar | amber fade": {
    "name": "Galil AR | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2n5rp8SNJ0POvV6JsJPWsA2KEwOJ6ueJWQyC0nQlp52uGm9yodC3GZ1d0CMdyQeJctRDqmtayY-Kz71fW2IIUziz8intK6TErvbiZh4dEMQ",
    "category": "Rifles",
    "rarityColor": "#4b69ff"
  },
  "glock-18 | fade": {
    "name": "Glock-18 | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1a7s2oaaBoH_yaCW-Ej-8u5bZvHnq1w0Vz62TUzNj4eCiVblMmXMAkROJeskLpkdXjMrzksVTAy9US8PY25So",
    "category": "Pistols",
    "rarityColor": "#8847ff"
  },
  "glock-18 | gamma doppler": {
    "name": "Glock-18 | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1a4s2paalgIc-XAXeAzetkj_FhTjq2wSIgvzKGkbD1KCzPKhhxC5FyRbII4Ua_ltDhY-Ln41fW2I1Ayn_9ii5P7Xpr5ekHV6Mg__HekUifZpA8glcU",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "glock-18 | water elemental": {
    "name": "Glock-18 | Water Elemental",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1Y-s2pZKtuK72fB3aFxP11te99cCW6khUz_TjVyompc3-QOFR2DJQkFOMJtBbqk9LlY-7n5QLZjtkTxCWqhixPv311o7FVIf8eASQ",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "glock-18 | vogue": {
    "name": "Glock-18 | Vogue",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1Y-s2pZKtuK8-WF2KTzuBiseJ9cCW6khUz_T-GyNavdCqRawN1CMFwTOcO5hO7loXiY-zmsQKPi44QzHj22ikcvy11o7FVfFOBmfY",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "glock-18 | neo-noir": {
    "name": "Glock-18 | Neo-Noir",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1Y-s2pZKtuK8-dAW6C_uJ_t-l9AXznwh9zsjjSn9j9dH-eb1V0CsF3QrNZ4xW8ltPlM-7h4QbYit5NzyzgznQecekkTuo",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "p2000 | amber fade": {
    "name": "P2000 | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL5lYayrXIL0POvV6JsJPWsA2KEwOJ6ueJWQyC0nQlpsjvcmd_7dHyVZgdxAsB1QeRZ5BPqlYbmNuvr5lTW2o1Myyyt3ykY7DErvbib25P3aA",
    "category": "Pistols",
    "rarityColor": "#8847ff"
  },
  "★ butterfly knife | fade": {
    "name": "★ Butterfly Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2avx-9ytd5lRi67gVNwsDvSwtqqc3iXZg4kCZYjReYLtRbum9XgYuvm5wbWjtgUzCn3iSsf8G81tFEeH9rw",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ butterfly knife | doppler": {
    "name": "★ Butterfly Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2qv0u9moOlgXSyMmBw1sTGAk5X8JRTFAVp5Xco0W-ENtRXswYC1Mu_ks1fdjN9EyiqthiMbvHtv5btQBPck-KbT2gnHM-Ajoc5Ufn65u8U",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ butterfly knife | gamma doppler": {
    "name": "★ Butterfly Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2qvxu97veBWSyajhREioQKVko7qJH_4Ml93UtZuQrVe4EOxkNHvYryx5g2L39oXyS6q2ixM5i9s474GUast_6PU3AuXY6p9v8diATcRqA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ butterfly knife | marble fade": {
    "name": "★ Butterfly Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2qvzO9ksu1scC-ykRgYvzSCkpu3JCrBPVMkCZIiFLUC40S-l9DkZerg4Qfc3Y9DzCuo3SlK6ydv5e9UA71lpPNwsjHPzA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ butterfly knife | case hardened": {
    "name": "★ Butterfly Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD3avzud6teVWQyC0nQlp5z6AyN_7I3mfOFQnApUlFrMN5BbpwdbhP-vgs1Pd3dpBmXr9jnwf6DErvbim1G57Bg",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ survival knife | fade": {
    "name": "★ Survival Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y7vyne5tsIc-VD2OV_uJ_t-l9AXuwwBh0sT-BydarInPGPQUpCMcjELJY5xm4xIG0NLy241Dag9hNzirgznQeOQeAleU",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ survival knife | doppler": {
    "name": "★ Survival Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y7vyne5tsLc-AD3eAyedktd5kTjuxmRguqTiBpYPwJiPTcAUjCpohTOYPtES7ldzvYrjl5laLi4JBnC_6iS1PvHtst7wDV_Ui-fLJz1aWWu-XwP8",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ survival knife | marble fade": {
    "name": "★ Survival Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y7vyne5tsLc-eD3WSzetJtuBtSha_nBovp3OGztqtIH-RbwV1X5Z5QuEPshGwl9TuY-vrsQPd3d0QmSz72nwY5ilo_a9cBrKGUnAZ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ survival knife | case hardened": {
    "name": "★ Survival Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y7vyne5tsMc-cB2uVxdF6ueZhW2fmx0gi4jzQm9qhdSqSPVRzDJR2FOEKsha4xtbgPuy04QON3YJEyyr_kGoXuQK6HIuK",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ paracord knife | fade": {
    "name": "★ Paracord Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y4OCqV6VsH_aSCmKvzedxuPUnHSixkUl-4mqEnNj8IH3BOgUjX5RzFOMDthewlN3iYu-27gHcio1DmTK-0H2HlTMq_Q",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ paracord knife | doppler": {
    "name": "★ Paracord Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf0PzadQJD4eOllZCbn_7mNoTcl3lT5MB4kOzFyoD8j1yg5UBrZ2imJdfDIAI8Zw3Q_Ve4kuzn1JO6upzLnCBgvnYqs3zayxC-hktSLrs4UIqIpQQ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ paracord knife | marble fade": {
    "name": "★ Paracord Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y4OCqV6VgH_2SHGWcxNFwseVscCW6khUz_TnXw9-qdyiWbQEiA8FxROQMtxPqlILjM7vk4waIjoxNmSr9iyxK6yh1o7FVj-pHDZk",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ paracord knife | case hardened": {
    "name": "★ Paracord Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y4OCqV6V8H_-aAmKU_uJ_t-l9ASrglh8l5DjWz479d3iTOwYlX5UhFrYMsRnrltWxNrzl5QHYjYJCyX_gznQeOO_KAyk",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ classic knife | fade": {
    "name": "★ Classic Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y_OGRaaVSJvGXC1icyOl-pK9tHn-yxhkltmTVnon4IHqUbgInWcN1ELIK5hS9xIbkZumx4wONjd9H02yg2Yau6XG6",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ classic knife | case hardened": {
    "name": "★ Classic Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y_OGRabVSL_mfC2OvzedxuPUnSSjlxxsi627cyNevdnOWbAFyAsEmRbZesRSxlNXlNOm051aK34JAmDK-0H1p4FgDwA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ falchion knife | fade": {
    "name": "★ Falchion Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SD1iWwOpzj-1gSCGn20l-tmjVmIqhdHmWa1AkCJRyFuUItBW9wNTmY7jh5ADa3o5Fy3-sinhXrnE8OtZmGks",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ falchion knife | doppler": {
    "name": "★ Falchion Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SA1iDwP5muOh7Sha-lA8lvziMgIr9HifOOV5kFMB1TeAIsxi5w4K0Y7_jtVTc3d1MzX_3iSxAuy85seYDA6Bxq6eCjV7fcepqbrrX6Yc",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ falchion knife | gamma doppler": {
    "name": "★ Falchion Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SA1iXwON7sd5tQDmjmRg1jC2Nm5z8dRTLN1F4Tox2RO8NtxG9kYCxYbvisw3bj9lByCyo3ylKuy9stboEUqcn_a3RiFuVL_Rjtvg0XKwV",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ falchion knife | marble fade": {
    "name": "★ Falchion Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SA1idwPx0vORWSSi3kCIrujqNjsGqdXrFbFIlA8QjTO8Lu0O7m921ZLy05gfXj99Aziz_2nscuic6sr4AT-N7rSTjmXt5",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ falchion knife | case hardened": {
    "name": "★ Falchion Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SH1ifyOJztN5lRi67gVMi4z-Hz96tcSiUblcoA5tyTONZsxG4wdPjZLvg4Q3ej99Ezyr2jS1L8G81tJVww3hv",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ flip knife | fade": {
    "name": "★ Flip Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6VsH_aSCmKvzedxuPUnTXywzR9-427Qyd34d3iUb1RyDJMlQbQL5xTtw920Zby05FeNjohDzDK-0H3GjMwqlg",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ flip knife | doppler": {
    "name": "★ Flip Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6VgH-OSHneYyPxzj-xoXSu_kBQ9tjm6lob-KT-JOgYjXJEmR7Jbs0S8mtSzZezg5wSMit5BzyX7ii9L63455ewFUvAg-LqX0V_ipKFLBg",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ flip knife | gamma doppler": {
    "name": "★ Flip Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6VgH_eSA2qR_up5oPFlSjuMhRUmoDjRpYPwJiPTcFN2XJshE-ZfuhS-w9PgMuuxtQTZ2YoRzXj_3Ssf6ntp6rxWUass-KDJz1aW7hm8L5o",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ flip knife | marble fade": {
    "name": "★ Flip Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6VgH_2SHGWcxNFwseVscCW6khUz_WqBnt2qIyrBPwMoCcN1R7YCtRa7kofhY7nk4gzajNhEzyT43HhK6CZ1o7FVaZCrJoQ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ flip knife | case hardened": {
    "name": "★ Flip Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6V8H_-aAmKU_uJ_t-l9ASu2l0Qj4m7cnNf6JSqSZgAhA5NzFOALsBbrkILuPu625AXcjdpGz33gznQe1ZCqub0",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ gut knife | fade": {
    "name": "★ Gut Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRaaVSJvGXC1icyOl-pK88HyjikUR_6z_UmIyudy-WPVByCpRzQ7UDukbtmofmM-3r4gaKjINH02yg2St2xdPu",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ gut knife | doppler": {
    "name": "★ Gut Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRaalSM_GDHm-Z0-tJveB7TSW2nAcitwKJk4jxNWWQO1IjW5d4RLUOsEG_lYCxZbjq5QDejYlBnn6o2y9LvCti4OtRUfUl5OSJ2CIbbpiB",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ gut knife | gamma doppler": {
    "name": "★ Gut Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRaalSJ_GeA2avxeFmoO1sXRajnRw0tmm6lob-KT-JbANxW5okTLMPuhmwmtO2N7-z71bdjNpMm3-s23wb7Cc-4OtRB_Ug_LqX0V_Ys9LWqg",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ gut knife | marble fade": {
    "name": "★ Gut Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRaalSLfGBDGuV_uh3tORWQyC0nQlp4TzTnNz_cHifawAiW8QjTe8Lu0K9w9HjY77m4lTXjI1FyCz9hnxBvDErvbgdMZDtHA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ gut knife | case hardened": {
    "name": "★ Gut Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRabVSL_mfC2OvzedxuPUnGSvklk535GrRm9arInnEbg8nW8AjRucC4UK-kNDjZO_rtQDWjY1FnDK-0H0tccFB2g",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ navaja knife | fade": {
    "name": "★ Navaja Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c9uK9cZtnIfOYBWmZx-tJseBWSSi3kCIrujqNjsH7c3qVOwV2DcZyQbQOukG5m4CyMeqz4laIgoxAnH_93Ckbvyw5troCT-N7rT3KN2DN",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ navaja knife | doppler": {
    "name": "★ Navaja Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c9uK9cZtnIfOYBWmZx-tJsexWXCijhRUuoTi6l47rIyfCN0x1Xv0sHLBS9g6_m4GzMr-xsgOIidhMyC743C1O53ti5ecCWPAmrqeCjg2QNbU06ZBROr_5GjZZEpGb",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ navaja knife | marble fade": {
    "name": "★ Navaja Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c9uK9cZtnIfOYBWmZx-tJsexWQiihlxEijDuEnorGLSLANkI-DpolR7Vf5hK5kdTlNbiwsg3YiNlCm3mq3Cgd6iZusetRUPJx-qTT2xaBb-MDauzVhA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ navaja knife | case hardened": {
    "name": "★ Navaja Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c9uK9cZtnIfOYBWmZx-tJsfBWQCC_kBkYvzSCkpu3eHKWaQ8jXpQkReZZtxa_x4HvYujh41HZg9pNzX2ojCJA7itpteYHBb1lpPM10bWGng",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ karambit | fade": {
    "name": "★ Karambit | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SD1iWwOpzj-1gSCGn20tztm_UyIn_JHKUbgYlWMcmQ-ZcskSwldS0MOnntAfd3YlMzH35jntXrnE8SOGRGG8",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ karambit | doppler": {
    "name": "★ Karambit | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SA1iDwP5muOh7Sha-lA8lvziMgIr9HifOOV5kFMRxFuEM5hi_xNXhMbmx5VCMjd9MyCv6jigc6n064ucLAvZ3_6bViV3fcepqpLtspE0",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ karambit | gamma doppler": {
    "name": "★ Karambit | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SA1iXwON7sd5tQDmjmRg1jC2Nm5z8dRTLN1F4ToxwQLNZ5xa-xNDuNu_ktgCN2YtNn36thypAuidrsb4BUqMj_qPfiwCTL_Rjtpd8Mt3S",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ karambit | marble fade": {
    "name": "★ Karambit | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SA1idwPx0vORWSSi3kCIrujqNjsGveH2RaVRxX5ohEe4Juhawm4fiM-ji4APf2YMXmSz_hyoduytv4uhWT-N7rfLHGBJ4",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ karambit | case hardened": {
    "name": "★ Karambit | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SH1ifyOJztN5lRi67gVNz5DvUmdj4eXuWOFAhAsF4RLFc5BC4xtbuY7yx7wDbgo9CzSj2h3xK8G81tB_XeHWq",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ kukri knife | fade": {
    "name": "★ Kukri Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q-vm8YZtsIc-VD2OV_uJ_t-l9AXyyzEohsGvVn4moIi-VO1N2CJR1E-UD4BXtkIXhMe2x7lbej4tEnyzgznQeN9c5PgA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ kukri knife | case hardened": {
    "name": "★ Kukri Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q-vm8YZtsMc-cB2uVxdF6ueZhW2fizRsk4G_dzY39eCrCaA51W8QlF-ZZtRK6m4XlPunn71TbjY0QzimokGoXuR84GhWV",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ m9 bayonet | fade": {
    "name": "★ M9 Bayonet | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWaR_uh3tORWQyC0nQlp4znQytr6cnjFbg8oC8BzRrQK50S-lNDgP-_r5wWP3t5CyX37jCIb7DErvbiJu9Hv_g",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ m9 bayonet | doppler": {
    "name": "★ M9 Bayonet | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWad_v13oPFhRju2qhAmoT-Jn4bjJC_4Ml93UtZuQrZfuhi5lYC1Pujr7lDd2YNAmy2siHlJ6Htu5r5TUqcm-6De2wiUOap9v8cDcIwcZw",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ m9 bayonet | gamma doppler": {
    "name": "★ M9 Bayonet | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWad_ul3vexocC28hQ0rti-6iof4Mi6TAVp5Xco0W-UPsBDuwdfgN-jn5FHXjdpNzn322CpP5i064-oBVaEm_PWGjFmXMrAjoc5UYR0MRG0",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ m9 bayonet | marble fade": {
    "name": "★ M9 Bayonet | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWad_uN3ouNlSha1lBkijDGMnYftb3OTbVRyD8Z1RrNctkS6kobkZLzi7gTW2NpFxH33hi9Nuno65uxXAqs7uvqA7lyFHH4",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ m9 bayonet | case hardened": {
    "name": "★ M9 Bayonet | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWaB_uF_vORtcCW6khUz_WvXnNqteHKQZlV0CpolFLZZthDpxIKyNLmx4ADYiNpHmXqvjSJA5iZ1o7FVI83_8yo",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ nomad knife | fade": {
    "name": "★ Nomad Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1U-uaqZ6t_H_GSMWGRxetJvOhuRz39wUUksW7Vm4n7d3yUO1InXsdxTeQDukO4l9zuN7_j5QzYjIlFy3n6jDQJsHjNMoy1vA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ nomad knife | doppler": {
    "name": "★ Nomad Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1U-uaqZ6t_H_GeMXSR0f5-ufNscCSyhx8rtjSfn4vGLSLANkI-DZF4E7EL4xiwxILgMLni41SM3o8Uz3j4h3tJ6ik_sO9WU_F3-KPUjRaBb-NU6ZNx2A",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ nomad knife | marble fade": {
    "name": "★ Nomad Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1U-uaqZ6t_H_GeMWqR0-x6td5vTi22qhEutDWR1NqsdS6Wa1UpC8cjQ7QJ5BHqx9zjZurgsgfZiYgXn3r7hy8b6yo_5OocEf1y7tM7KOE",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ nomad knife | case hardened": {
    "name": "★ Nomad Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1U-uaqZ6t_H_GCMWiZzetyj-1gSCGn2xhz5GyHwtr_dS7EOlR1DZtyEe8MsBO-xNKyNbnq7w3b2d8WzC7-jSNXrnE8rdGSE7w",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ shadow daggers | fade": {
    "name": "★ Shadow Daggers | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6VsH_aSCmKvzedxuPUnFy-3l0tz5DmGzNmhdnmVblB0CcMjTbQJsBe6k9zlMuLl4gHYjoIRmDK-0H3ZqbeWvA",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ shadow daggers | doppler": {
    "name": "★ Shadow Daggers | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6VgH-OSHneYyPxzj-xoXSu_kBQ9tjm6mLD1KCzPKhghX5N4EOBfthfsw4LnYuvh5AbfioNHmyms3Cgf6Sk54e4CVvIl_qOEkUifZuDD3SRj",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ shadow daggers | gamma doppler": {
    "name": "★ Shadow Daggers | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6VgH_eSA2qR_up5oPFlSjuMhRUmoDjRpYPwJiPTcFB2DJB3F-4LsBG_kd21Ne23tVPait9HmX6t2n5P6i1q5uoHAKJwq6TJz1aWm5wQ7fM",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ shadow daggers | marble fade": {
    "name": "★ Shadow Daggers | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6VgH_2SHGWcxNFwseVscCW6khUz_T_dyI2tJXrFbQN2X5MjTLUCtEa5kYXnYuPh5QGLjowUxXitjixA7nl1o7FVu7_YRqU",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ shadow daggers | case hardened": {
    "name": "★ Shadow Daggers | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6V8H_-aAmKU_uJ_t-l9AX3kkEx1tz7Vw437dXmUbQ9zCpF2RrUDsRe4wNXuZuzm7lHW2I0TzC_gznQe3C7aMsc",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ skeleton knife | fade": {
    "name": "★ Skeleton Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I5PeibbBiLs-SD1iWwOpzj-1gSCGn20kjt2-En9mpcCmQag8hXsciQeJYthW9kILkMLji4g3Ygo8Uznj6jX9XrnE8raC5r1M",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ skeleton knife | doppler": {
    "name": "★ Skeleton Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I5PeibbBiLs-SA1iDwP5muOh7Sha-lA8lvziMgIr9HifOOV5kFJN4FOMPtRi9wdK2MuvksVPa34NMyyX62C0a7Ho_5-pWBaQtrqXfjFzfcepq5_yhcsc",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ skeleton knife | marble fade": {
    "name": "★ Skeleton Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I5PeibbBiLs-SA1idwPx0vORWSSi3kCIrujqNjsGtdy-SbFUhApd1QbZbsUa7l9LmMurktgza3tgQxC38iS0Y6Hlo4rsKT-N7rTdSaj39",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ skeleton knife | case hardened": {
    "name": "★ Skeleton Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I5PeibbBiLs-SH1ifyOJztN5lRi67gVMj6m3Rnt2sdnOUZwIgWJAkTLUJ4xbrx9buYuywsgCLjItBmC79jiNN8G81tGbdgHHm",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ stiletto knife | fade": {
    "name": "★ Stiletto Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-_uibbB5L8-SD1iWwOpzj-1gSCGn20h2smqHzNuqcy6TawckApJ5EeIJuxPpwNaxMejmtQLa2o5Nnnj3hy9XrnE8H9hk9aQ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ stiletto knife | doppler": {
    "name": "★ Stiletto Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-_uibbB5L8-SA1iDwP5muOh7Sha-lA8lvziMgIr9HifOOV5kFMYmE-VfuxK-x9O0Yu7n4wDWgoxFyyz7jy4d53w65uxTVqR2qfHTi1vfcepq9g3r7qM",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ stiletto knife | marble fade": {
    "name": "★ Stiletto Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-_uibbB5L8-SA1idwPx0vORWSSi3kCIrujqNjsGgI3mSbgIoA8N3TeICtBC-kYG0Nenl4QPYjIJHmX6qingY5yZut-cHT-N7rRs0KjZk",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ stiletto knife | case hardened": {
    "name": "★ Stiletto Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-_uibbB5L8-SH1ifyOJztN5lRi67gVNzsWTdn92oJy6XaVUgWJQlQuALtxS4l4HnMrzk5VDc2d1Mmyj9hn8b8G81tHhX34fn",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bowie knife | fade": {
    "name": "★ Bowie Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3sd5vTi22qhEutDWR1NiocCqeZwYoC5pxRuMM5BPqxtTgY-20sgXZ2NpHnyqqiCpA5nk56u8cEf1y_UmCvro",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bowie knife | doppler": {
    "name": "★ Bowie Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3vd56TjmjnRQ1tgKIm537LS7OJFN0Zc4pEr9OrBaxl4KxNr7r5VHZiYtBzH-qiShJ7y1v4roHAvZ2qfLTjlvDOLw_sMIdZKHwjx9VvzI",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bowie knife | gamma doppler": {
    "name": "★ Bowie Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3vd5uTiS-lCIjvC2VlorrHjvPP0V1Dv0sHLBS9g6-xoXnNr6xsQze2IxFy377iX4d7itr4ehWA_V0_aPT2VyTMudrs8YLOr_5GgyA1D52",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bowie knife | marble fade": {
    "name": "★ Bowie Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3vd5kTjuxmRgYtTyBn7D1KCzPKhgpXMdyTeBb5BPuktPvZOi2sgWM2d9HmSr-i3xAuidssO8HBKcsrvLXkUifZhxP_T8X",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ bowie knife | case hardened": {
    "name": "★ Bowie Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3od5mRiW2kSIrujqNjsH_eHrFOAdzA8B2TeQLtBm6x4flNejislbb2tlHxCyti3tK53xq6uhTT-N7rR3UNjRY",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ huntsman knife | fade": {
    "name": "★ Huntsman Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SD1iWwOpzj-1gSCGn2x8hsW6DmIqpcXjBZgYkCZt5F7VcthS8ldS2Nr7m5VCMi4gRyyuqjHtXrnE8oar8MtU",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ huntsman knife | doppler": {
    "name": "★ Huntsman Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SA1iDwP5muOh7Sha-lA8lvziMgIr9HifOOV5kFMN5Qe8CshbrltLlNOqxsgLc2t8Uzyv9jSNLuC9r4-oEVfB2r_GFjg3fcepqRzB392E",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ huntsman knife | gamma doppler": {
    "name": "★ Huntsman Knife | Gamma Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SA1iXwON7sd5tQDmjmRg1jC2Nm5z8dRTLN1F4TowjF-ULthGxkdDhZuqw4A3diYwTyiX33S8f5yto4rkKUKsirqzTigySL_RjtsSe7bgM",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ huntsman knife | marble fade": {
    "name": "★ Huntsman Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SA1idwPx0vORWSSi3kCIrujqNjsH8JXvCZgEiDZVwEeUK40W6ldaxZOnn7g3Zj4gUmySoi39A7SxqsrsET-N7rT4plPHN",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ huntsman knife | case hardened": {
    "name": "★ Huntsman Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SH1ifyOJztN5lRi67gVN_4W-Byt-hIi2UbVV2W5p2Fu4PuxmxkdO0Zejj7wff3okWzCT3ji4f8G81tJdWCOsa",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ ursus knife | fade": {
    "name": "★ Ursus Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1O_eG7e5tsIc-VD2OV_uJ_t-l9AXzml00i527XzouseH7GblAjX5N3R-NbuhLswYfjY-zj7laKjdkRyX_gznQeK-1-7hY",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ ursus knife | doppler": {
    "name": "★ Ursus Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1O_eG7e5tsLc-AD3eAyedktd5kTjuxmRguqTiBpYPwJiPTcAB2DpUkRrYK50awk9LhZrjg4lPZ2I1Dzyr_3X8Y6n1j4roFUKcl_qPJz1aWr6Afqe0",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ ursus knife | marble fade": {
    "name": "★ Ursus Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1O_eG7e5tsLc-eD3WSzetJtuBtSha_nBovp3OEw92gdH_DPFcnWMB2EO9f5EPsktzhNO_n5gCIjdhHxH3_hnwauiht_a9cBmW6TNz5",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ ursus knife | case hardened": {
    "name": "★ Ursus Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1O_eG7e5tsMc-cB2uVxdF6ueZhW2fmxBx-427Xntr_c3rBaFIkDZAhRLVYtxXql9LjMe_itQKL2d0UzXmskGoXueV9R1qR",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ talon knife | fade": {
    "name": "★ Talon Knife | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1M5vahf6lsK_WBMWaR_uh3tORWQyC0nQlpsmXcnNaoeHuTZwUiWMZzRrVZsxm9x9ThNrzj4QCPjdhNmHj73S9KujErvbhX2ACGeQ",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ talon knife | doppler": {
    "name": "★ Talon Knife | Doppler",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1M5vahf6lsK_WBMWad_v13oPFhRju2qhAmoT-Jn4bjJC_4Ml93UtZuF-MMt0btxtHlZr7m5gKKjYwRmH2oj3gcuH095e1QAqVwqKzUjluTMKp9v8cWgnOBZw",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ talon knife | marble fade": {
    "name": "★ Talon Knife | Marble Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1M5vahf6lsK_WBMWad_uN3ouNlSha1lBkijCqMnoDuHifOOV5kFJMlQecC4RW5x4bkMLvgsgGP2IIXzy_-iysaunlo4bwEBfYh_aLS3A7fcepqAVr8ibw",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "★ talon knife | case hardened": {
    "name": "★ Talon Knife | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1M5vahf6lsK_WBMWaB_uF_vORtcCW6khUz_WqBzd39Ii_CaVApAsYlEeUO4xXslNexY7nl5ALWjI0WmSqq3XlN5yx1o7FV8eN3eSM",
    "category": "Knives",
    "rarityColor": "#eb4b4b"
  },
  "m4a4 | asiimov": {
    "name": "M4A4 | Asiimov",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6V6V-Kf2cGFidxOp_pewnTii3w0x_tmTRnt2qdHyWaFAjA5UlQOYI5BO5k9bhZunm41OI34NDnjK-0H3pAWw_Rw",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a4 | howl": {
    "name": "M4A4 | Howl",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afVSKP-EAm6extF6ueZhW2exwkl2tmTXwt39eCiUPQR2DMN4TOVetUK8xoLgM-K341eM2otDnC6okGoXufBz_TAB",
    "category": "Rifles",
    "rarityColor": "#e4ae39"
  },
  "m4a4 | in living color": {
    "name": "M4A4 | In Living Color",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afBSLP-FC1icyOl-pK84GH2wxhty4DjcyNuhdHyXbAVxW8QjTbEMthC8kNa0MLmzs1Hbj95E02yg2bbWGcKW",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a4 | neo-noir": {
    "name": "M4A4 | Neo-Noir",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afBSLvWcMWmfyPxJvOhuRz39wE1142vSztmvInvBOgV0W5R1FLYNuxW4wIbgNrmx4g2Kj4tMmCX93zQJsHgJr0dqFw",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a4 | the emperor": {
    "name": "M4A4 | The Emperor",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiVI0P_6afBSJf2DC3Wf09F6ueZhW2exwBh_6m3dnt36InjDPQ4oXJt1TbJeshW_mtfjN-vrsgaKiokWy333kGoXuRj4z9Nd",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a1-s | fade": {
    "name": "M4A1-S | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_GSMWGRxetJvbVoHjqMmRQguynLm92pci2WagEkC5Z5Q7VetkbukIXjNrnm5QPbjt8WxS-vii4b5i5v4fFCD_TfxF4xWg",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a1-s | hyper beast": {
    "name": "M4A1-S | Hyper Beast",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_OGMWrEwL9JuPh5SjuMlxgmoCm6lob-KT-JbwF1WZEjR-YJskK9k9XiYePltAeNjYlAxSn5j34dvCZstb4LB6Ut-7qX0V8Xkv5_2A",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a1-s | cyrex": {
    "name": "M4A1-S | Cyrex",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_OGMWrEwL9lj-JwXSyrqhEutDWR1N77cimSbQQgC8F5QLYCsELpltTnZuvk7wbcjdhDzy_43yMb6ilvt7kcEf1yDWu2yf8",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a1-s | printstream": {
    "name": "M4A1-S | Printstream",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_OGMWrEwL9lj_F7Rienhgk1tjyIpYPwJiPTcAAoCpsiEO5ZsUbpm9C2Zuni4VHW3o5EzSX62HxP7Sg96-hWVqYi_6TJz1aW0nxrkGs",
    "category": "Rifles",
    "rarityColor": "#eb4b4b"
  },
  "m4a1-s | decimator": {
    "name": "M4A1-S | Decimator",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_eAMWrEwL9JtORqRiSygRI1jDGMnYftb3iUb1dxW5ImFLNftxCxktflZLm2tgaP2otGyn_-hytOvy9q5elQV_A7uvqA6CRSoZY",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "m4a1-s | black lotus": {
    "name": "M4A1-S | Black Lotus",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_ux6seJicCW8gQg0jDGMnYftb3-eOgEpDcFyQuMMtRG8kIbhMuK051ba2IMQyH6r3yof5ilv4bwLWfU7uvqA7qRNHGA",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "m4a4 | faded zebra": {
    "name": "M4A4 | Faded Zebra",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFL0OirarZsI_GeMWWH_uJ_t-l9AXu3zBkhsDyHz4z9dXmVagJzW8MiQbFetBfrkNHhZbjr51CMiN8TyS_gznQeEoYBjXk",
    "category": "Rifles",
    "rarityColor": "#4b69ff"
  },
  "mac-10 | fade": {
    "name": "MAC-10 | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1a7s2oaaBoH_yaCW-Ej-h347AwHyzqx04l4WvSyI77cCjCbQEhW8MjE-NcthG8loXlMujh7g3Ay9USCa6Cs30",
    "category": "SMGs",
    "rarityColor": "#4b69ff"
  },
  "mac-10 | amber fade": {
    "name": "MAC-10 | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1a7s2oaaBoH_2WGmaczed1j-1gSCGn20QlsWqAz4z8d3yfP1IpW8QkQeIN5hXtldTkMuqzsQyNjNgUxX6vjCpXrnE8FVzqUc8",
    "category": "SMGs",
    "rarityColor": "#4b69ff"
  },
  "mac-10 | case hardened": {
    "name": "MAC-10 | Case Hardened",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1a_s2hYahoJM-fB2CY1aAituJtTnvjkUx3tziGmd6hJy-VZlAoWZtwFLRZ5EbpwNLvYb-zsgOKlcsbmn9_3b1O",
    "category": "SMGs",
    "rarityColor": "#8847ff"
  },
  "mac-10 | heat": {
    "name": "MAC-10 | Heat",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1Y-s2jaac8cM-BC2OYzvpJvOhuRz39xR5w4GzUyo6pdnuUawMpWJokTLUL50K6l9XiNO7i4lGKiYsRxCv6jTQJsHim4lDW8g",
    "category": "SMGs",
    "rarityColor": "#8847ff"
  },
  "mag-7 | swag-7": {
    "name": "MAG-7 | SWAG-7",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiNK0P-vb_NSM-eSCTCvzedxuPUnHirhkxhxtzvRzI38dnLEOlQnW5N1F-FZtRG6kYLvPu205ADaj40RnDK-0H0F4y2tgg",
    "category": "Heavy",
    "rarityColor": "#8847ff"
  },
  "mag-7 | insomnia": {
    "name": "MAG-7 | Insomnia",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiFO0P-vb_NSKf6AAWqeyO9JvOhuRz39wh4k4TzUnN_9cC6WO1J2DJdyROcI4BC9x9XmN-vj71eN34xAzC33hzQJsHiziLtbUA",
    "category": "Heavy",
    "rarityColor": "#4b69ff"
  },
  "mag-7 | monster call": {
    "name": "MAG-7 | Monster Call",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiFO0P-vb_NSLf-dHXOV09F1se1lcCW6khUz_WncmIz8JHmTa1JyApd5FLEMsES-kNDhM-3i5QKM2Y5AzSr9jngY6Cp1o7FV7cAHRyI",
    "category": "Heavy",
    "rarityColor": "#8847ff"
  },
  "mag-7 | cobalt core": {
    "name": "MAG-7 | Cobalt Core",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiFO0P-vb_NSLemBDWKexNF6ueZhW2fkwBshsT-DntuscSiVbABzD5Z2QuRftRXuwYblY-_i5AePj49Emyn7kGoXuSUXTp8T",
    "category": "Heavy",
    "rarityColor": "#4b69ff"
  },
  "mag-7 | heat": {
    "name": "MAG-7 | Heat",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiFO0P-vb_NSMvWXBmiE_uJ_t-l9AX7nzBsk623dm46odHmUbFd1Dcd2RbINtBXtkNDjMbzj5AGKjt4UyijgznQe8JftFTE",
    "category": "Heavy",
    "rarityColor": "#8847ff"
  },
  "mag-7 | justice": {
    "name": "MAG-7 | Justice",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiVI0P-vb_NSKuWAGm6TxNF6ueZhW2fikUt36znWyNz_dn2ROgMhD5EiR7EO5BKxl4DlMLyx7gyNi4hAniz5kGoXuQ9OXJLa",
    "category": "Heavy",
    "rarityColor": "#d32ce6"
  },
  "mag-7 | bulldozer": {
    "name": "MAG-7 | Bulldozer",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wjFU0OurZKhiN8-fB2CY1aAn4bMxFijqzB5z4WjdnI2vc3nFbFcpCpomR-8NtxK_x9W2MO_k5VDYlcsbmtRYf5JR",
    "category": "Heavy",
    "rarityColor": "#8847ff"
  },
  "mp7 | fade": {
    "name": "MP7 | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8jsHf_CNk6fOqbZtgMKesAm6Xyfo45LQ7Fy3rzR536j6HyYn6J3zFaAcjA5RwQ-9fs0O5m93nMe2x5QHfjZUFk3sMNd5yQw",
    "category": "SMGs",
    "rarityColor": "#8847ff"
  },
  "mp9 | bulldozer": {
    "name": "MP9 | Bulldozer",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8js_f7i1k9veiZKt6H_yaCW-Ej-tztbQ5Hy2wxklw5TiDnt_4eC_GOFR1XJdzQ-AMskXswNbvNuvq4wPAy9USwXKj73o",
    "category": "SMGs",
    "rarityColor": "#8847ff"
  },
  "nova | hyper beast": {
    "name": "Nova | Hyper Beast",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL_kYDhwiFO0PyhfqVSKOmDC3WSxO9lpN5lRi67gVMhsGrTmd2seH6XbA4pDZR1EbMCtES8m4fiNenl4FDcid1Az32ri3tM8G81tMCTwFwB",
    "category": "Heavy",
    "rarityColor": "#d32ce6"
  },
  "p250 | asiimov": {
    "name": "P250 | Asiimov",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiFO0OL8PfRSIeOaB2qf19F6ueZhW2fixx53tWqEm4ugeXuebQN0CZJyRrMJuxm4loCyPr_i51TfjtgXzi79kGoXuUXmUJzm",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "p90 | asiimov": {
    "name": "P90 | Asiimov",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhx8bf_jdk_6v-JaV-KfmeAXGvzedxuPUnTSjikRgksjuBzoz4dXLFb1QoC8QlTLQD4EPqk4LvN-Pns1aMioNBzTK-0H3gQVv65g",
    "category": "SMGs",
    "rarityColor": "#eb4b4b"
  },
  "r8 revolver | amber fade": {
    "name": "R8 Revolver | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLjm4Dv8TRe_c2vaZtrIfSWMWqV1e96vOhqcDu2gxIrpTiXpYPwJiPTcAIpDJckF-9cuhfqltDuZujgs1DZj4hDy338jnhM73xusOcKVaos-qPJz1aW9R0yRq8",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "r8 revolver | fade": {
    "name": "R8 Revolver | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLjm4Dv8TRe_c2vaZtrIfSWMXWV1-F6puR7cCW6khUz_W2EnIuheSiVZgIgX8F3Ee9YthLuw9LjMePqswCL34kQzHj6iypPu351o7FV6jjqgC8",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "sawed-off | amber fade": {
    "name": "Sawed-Off | Amber Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLin4Hl-S1d6c2vaZtrIfSWMWqV1e96vOhqcCW6khUz_TuHwt2odHKROA90WZN2Fu4DsEO-mtTlNLiws1SNi99NxHmtj3tI5n11o7FVJSB89LY",
    "category": "Heavy",
    "rarityColor": "#4b69ff"
  },
  "scar-20 | cyrex": {
    "name": "SCAR-20 | Cyrex",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLinZfyr3Jk7OeRe6dsMs-QF3WV2dF6ueZhW2fgzUR_52nUzYugICnCPVImApYkRO8NtkLtw4a1Nbzn7lSN2oITnCr5kGoXuXXxbesR",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "sg 553 | cyrex": {
    "name": "SG 553 | Cyrex",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLimcO1qx1Y-s29b_E4c8-QF3WV2dF6ueZhW2frlhl14W7Xzt6geXqQP1N0CMRyQuFY5kHsx9HmZejq7wPei91AzCT_kGoXueC0Dzdv",
    "category": "Rifles",
    "rarityColor": "#d32ce6"
  },
  "sg 553 | bulldozer": {
    "name": "SG 553 | Bulldozer",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLimcO1qx1I4M23bahhL-esAm6Xyfo44rZsF3jmwU53tmyDzYv6cHnCalQhXMckEe9Y5kXplIC0NrzrtAfcipUFk3th3T45rw",
    "category": "Rifles",
    "rarityColor": "#8847ff"
  },
  "ssg 08 | acid fade": {
    "name": "SSG 08 | Acid Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLijZGwpR1a7s2oaaBoH_eBD3SDze94tN5lRi67gVN05G3QzI6pIn2UOAYhDJMjEeANsBbtlYC2ZbvltA2P2I5FyHmq2Hka8G81tCngBDgW",
    "category": "Rifles",
    "rarityColor": "#4b69ff"
  },
  "zeus x27 | olympus": {
    "name": "Zeus x27 | Olympus",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLln4Xl7x1B6ue9V7BlNf6XC3WvxuFyj-1gSCGn2xl2sm7XnI6hdC-XPAcmXsF2RLIP4xbslty2NLvqswePjYlEySn33S9XrnE8cYTqlUY",
    "category": "Equipment",
    "rarityColor": "#d32ce6"
  },
  "tec-9 | decimator": {
    "name": "Tec-9 | Decimator",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLlm5W5wiVI0Oara_1SJPWQB2qR1eFkj-1gSCGn20h16j-Ew9j6Jy6QbQB1XJJzQLVYshXqm92xY-7g4wze3dpAySz2iXlXrnE8_HmWmcE",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "ump-45 | fade": {
    "name": "UMP-45 | Fade",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkk4a0qB1a7s2oaaBoH-WeHlicyOl-pK8_HHzmzU52sTjWntegc32faAR2DMEkELMI4xmxw4G1Yrnn4FCM3d4Q02yg2U-vv27j",
    "category": "SMGs",
    "rarityColor": "#d32ce6"
  },
  "ump-45 | neo-noir": {
    "name": "UMP-45 | Neo-Noir",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkk4a0qB1O4uL6PZtjJf-sAGiZ09F6ueZhW2flw0R0sGrcy4z9cn6XagVxCpR4F7Rb5BPplIbjY7vj4AOLjt0TzSj9kGoXuYU0ZhpI",
    "category": "SMGs",
    "rarityColor": "#d32ce6"
  },
  "usp-s | black lotus": {
    "name": "USP-S | Black Lotus",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_ux6seJicCW8gQg0jDGMnYftbynFZg8nXpt2Ru8D5hSwl9PhN7_m7wzdjotFxXr62y4Y6C894OxQVKA7uvqAvobUkb8",
    "category": "Pistols",
    "rarityColor": "#4b69ff"
  },
  "usp-s | cortex": {
    "name": "USP-S | Cortex",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_u1jpN5lRi67gVNz4G7Qm938cS_Da1AhXpB1EeVb4xm4mtDjN7vj4A3b2NpGyCr52i4Y8G81tMzdoYZ7",
    "category": "Pistols",
    "rarityColor": "#d32ce6"
  },
  "usp-s | cyrex": {
    "name": "USP-S | Cyrex",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_u1vouRxcCW6khUz_TjdzdmsJyiTZg8kX8N4ELUP5EPsw9G1YeLn5VTXjY0WxS6rhiIYuCd1o7FV2N83Spg",
    "category": "Pistols",
    "rarityColor": "#8847ff"
  },
  "usp-s | kill confirmed": {
    "name": "USP-S | Kill Confirmed",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_uV_vO1WTCa9kxQ1vjiBpYPwJiPTcFB2Xpp5TO5cskG9lYCxZu_jsVCL3o4Xnij23ClO5ik9tegFA_It8qHJz1aWe-uc160",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "usp-s | printstream": {
    "name": "USP-S | Printstream",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_v5kue99XD2hkBwqjDGMnYftb3yUPFR0XsNyRrNc5kO5ltziMenr5lONj4kXyi2riywc7y9o5LtQAqQ7uvqAkScWnv4",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "usp-s | neo-noir": {
    "name": "USP-S | Neo-Noir",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA0tF4v-h7cCW6khUz_WXdmd-vI3uRPwEkApR4QuBcu0Xrk4biYr_mtQXdidlCz3r63Ska7Hx1o7FVWuokIcU",
    "category": "Pistols",
    "rarityColor": "#eb4b4b"
  },
  "usp-s | jawbreaker": {
    "name": "USP-S | Jawbreaker",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSNeODHViUzulxqd5lRi67gVMl62nUyd2scnOVPAcgA5J2TOFY5xLrlN22YbzgsQaI2IlHyiWojnwa8G81tErOD-_J",
    "category": "Pistols",
  },
  "defuse kit": {
    "name": "Defuse Kit",
    "image": "https://cdn.steamstatic.com/apps/730/icons/econ/stickers/community/auto_racing/paper_defusal_sprint.d233c9ff56379357bcd13bcef463526f6403ab52.png",
    "category": "Equipment"
  }
}

export const CS2_WEAPON_ALIASES: Record<string, string> = {
  "m4a1": "m4a1-s",
  "m4": "m4a1-s",
  "m4a4": "m4a4",
  "ak47": "ak-47",
  "ak": "ak-47",
  "mag7": "mag-7",
  "shotgun": "mag-7",
  "usp": "usp-s",
  "glock": "glock-18",
  "deagle": "desert eagle",
  "c4": "c4 explosive",
  "bomb": "c4 explosive",
  "zeus": "zeus x27",
  "taser": "zeus x27",
  "defuser": "defuse kit",
  "kit": "defuse kit",
  "knife": "knife"
}

// In-memory cache for online skins resolved on the fly
const dynamicSkinCache = new Map<string, Cs2ItemMetadata>()

/**
 * Resolves real CS2 item metadata (image URL, skin details, category)
 * from weapon name or skin string.
 */
export const resolveCs2Item = (
  rawWeaponOrSkin?: string,
  skinName?: string
): Cs2ItemMetadata | null => {
  if (!rawWeaponOrSkin) return null

  const cleaned = rawWeaponOrSkin
    .replace(/^weapon_/i, '')
    .replace(/_silencer$/i, '-s')
    .toLowerCase()
    .trim()

  // 1. Direct compound match: e.g. "mag-7 | insomnia"
  if (CS2_ITEMS_REGISTRY[cleaned]) {
    return CS2_ITEMS_REGISTRY[cleaned]
  }
  if (dynamicSkinCache.has(cleaned)) {
    return dynamicSkinCache.get(cleaned)!
  }

  // 2. If separate skinName is provided, test compound
  if (skinName) {
    const compound = `${cleaned} | ${skinName.toLowerCase().trim()}`
    if (CS2_ITEMS_REGISTRY[compound]) {
      return CS2_ITEMS_REGISTRY[compound]
    }
    if (dynamicSkinCache.has(compound)) {
      return dynamicSkinCache.get(compound)!
    }
  }

  // 3. Check alias table
  const aliased = CS2_WEAPON_ALIASES[cleaned] || cleaned
  if (CS2_ITEMS_REGISTRY[aliased]) {
    return CS2_ITEMS_REGISTRY[aliased]
  }

  // 4. Prefix search (e.g. "m4a1-s" matching registry base)
  for (const [key, val] of Object.entries(CS2_ITEMS_REGISTRY)) {
    if (key === aliased || key.startsWith(aliased + ' |')) {
      return val
    }
  }

  return null
}

/**
 * Asynchronously searches ByMykel's skins.json for any arbitrary skin
 * not already included in the static bundle, caching it for subsequent renders.
 */
export const fetchCs2SkinOnline = async (query: string): Promise<Cs2ItemMetadata | null> => {
  const norm = query.toLowerCase().trim()
  if (dynamicSkinCache.has(norm)) {
    return dynamicSkinCache.get(norm)!
  }
  try {
    const res = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json')
    if (!res.ok) return null
    const skins: Array<{ name?: string; image?: string; category?: { name?: string }; rarity?: { color?: string } }> = await res.json()
    for (const s of skins) {
      if (s.name && s.image) {
        const item: Cs2ItemMetadata = {
          name: s.name,
          image: s.image,
          category: s.category?.name || 'Weapon Skin',
          rarityColor: s.rarity?.color,
        }
        dynamicSkinCache.set(s.name.toLowerCase().trim(), item)
      }
    }
    return dynamicSkinCache.get(norm) || null
  } catch {
    return null
  }
}

