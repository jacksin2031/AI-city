export const LANDMARKS = [
  {
    id: 1,
    key: "nikolai",
    name: "ニコライ堂（東京復活大聖堂）",
    description:
      "神田駿河台にある日本正教会の大聖堂です。1891年に建立され、国の重要文化財に指定されています。",
    image: "/landmarks/nikolai.jpg",
    imageCredit: "Alex Tora / Wikimedia Commons / CC BY-SA 3.0（2007年撮影）",
    imageSource: "https://commons.wikimedia.org/wiki/File:Nikolai_do_Alex_K_02.jpg",
    license: "https://creativecommons.org/licenses/by-sa/3.0/",
    source: "https://www.orthodoxjapan.jp/h-n.html",
    nodes: ["LM_nikolai_do_63", "LM_nikolai_do_64", "LM_nikolai_do_65", "LM_nikolai_do_66"],
  },
  {
    id: 2,
    key: "yushima",
    name: "湯島聖堂・大成殿",
    description:
      "湯島聖堂にある孔子を祀る大成殿です。湯島聖堂は江戸時代の学問の歴史を今に伝える史跡です。",
    image: "/landmarks/yushima.jpg",
    imageCredit: "Ocdp / Wikimedia Commons / CC0（2013年撮影）",
    imageSource: "https://commons.wikimedia.org/wiki/File:Yushima_Seido_002.jpg",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://www.city.bunkyo.lg.jp/b014/p003755.html",
    nodes: ["B_0047"],
  },
  {
    id: 3,
    key: "liberty",
    name: "明治大学リバティタワー",
    description: "明治大学駿河台キャンパスの建物で、教室や中央図書館などが入っています。",
    image: "/landmarks/liberty.jpg",
    imageCredit: "Kakidai / Wikimedia Commons / CC0（2024年撮影）",
    imageSource: "https://commons.wikimedia.org/wiki/File:Meiji_University_Liberty_tower.jpg",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://www.meiji.ac.jp/kanzai/k_ippan.html",
    nodes: ["B_0000"],
  },
  {
    id: 4,
    key: "sola",
    name: "御茶ノ水ソラシティ",
    description:
      "御茶ノ水にある複合施設です。新御茶ノ水駅とつながり、オフィスや店舗などがあります。",
    image: "/landmarks/sola.jpg",
    imageCredit: "Koh-etsu / Wikimedia Commons / CC0（2013年撮影）",
    imageSource: "https://commons.wikimedia.org/wiki/File:Solacity.jpg",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://plaza.solacity.jp/about/index.html",
    nodes: ["LM_sola_city_11"],
  },
  {
    id: 5,
    key: "station",
    name: "JR御茶ノ水駅",
    description:
      "中央線快速と中央・総武線各駅停車が乗り入れるJR東日本の駅です。1904年に開業しました。",
    image: "/landmarks/station.jpg",
    imageCredit: "L,t,d,express / Wikimedia Commons / CC BY-SA 3.0（2007年撮影・旧駅舎）",
    imageSource: "https://commons.wikimedia.org/wiki/File:Ochanomizu_Station-Hijiribashi_Exit.jpg",
    license: "https://creativecommons.org/licenses/by-sa/3.0/",
    source: "https://www.jreast.co.jp/estation/station/info.aspx?StationCD=384",
    nodes: [
      "LM_jr_ochanomizu_station_43",
      "LM_jr_ochanomizu_station_97",
      "LM_jr_ochanomizu_station_181",
      "LM_jr_ochanomizu_station_227",
      "LM_jr_ochanomizu_station_339",
    ],
  },
] as const;
export type Landmark = (typeof LANDMARKS)[number];
export function landmarkForNode(name: string): Landmark | undefined {
  return LANDMARKS.find((landmark) => (landmark.nodes as readonly string[]).includes(name));
}
