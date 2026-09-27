/***********************************************
> 应用名称：墨鱼自用B站去广告脚本
> 脚本作者：@ddgksf2013
> 微信账号：墨鱼手记
> 更新时间：2025-03-31
> 通知频道：https://t.me/ddgksf2021
> 贡献投稿：https://t.me/ddgksf2013_bot
> 问题反馈：ddgksf2013@163.com
> 特别提醒：如需转载请注明出处，谢谢合作！
***********************************************/

const version = "V2.0.122";

let body = $response.body;
if (body) {
  switch (!0) {
    case /pgc\/season\/app\/related\/recommend\?/.test($request.url):
      try {
        let a = JSON.parse(body);
        (a.result?.cards?.length &&
          (a.result.cards = a.result.cards.filter((a) => 2 != a.type)),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili recommend:` + a);
      }
      break;
    case /^https:\/\/app\.bilibili\.com\/x\/v2\/feed\/index\?/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body),
          b = [];
        for (let c of a.data.items)
          if (c.hasOwnProperty("banner_item")) continue;
          else if (
            !c.hasOwnProperty("ad_info") &&
            c.card_goto !== "ad" &&
            !c.card_goto?.startsWith("ad_")
          )
            b.push(c);
          else continue;
        ((a.data.items = b), (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili index:` + a);
      }
      break;
    case /^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index\/story\?/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body),
          b = [];
        for (let c of a.data.items)
          c.hasOwnProperty("ad_info") ||
            c.card_goto === "ad" ||
            c.card_goto?.startsWith("ad_") ||
            b.push(c);
        ((a.data.items = b), (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili Story:` + a);
      }
      break;
    case /^https?:\/\/app\.bilibili\.com\/x\/v2\/account\/mine/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body);
        let changed = false;
        a.data?.sections_v2?.forEach((section) => {
          if (Array.isArray(section.items)) {
            const items = section.items.filter(
              (item) =>
                item.id !== 622 &&
                item.title !== "会员购" &&
                item.title !== "會員購" &&
                !item.uri?.startsWith("bilibili://mall/"),
            );
            if (items.length !== section.items.length) {
              section.items = items;
              changed = true;
            }
          }
        });
        if (changed) body = JSON.stringify(a);
      } catch (a) {
        console.log(`bilibili mypage:` + a);
      }
      break;
    case /^https?:\/\/api\.live\.bilibili\.com\/xlive\/app-room\/v1\/index\/getInfoByRoom/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body);
        ((a.data.activity_banner_info = null),
          a.data?.shopping_info && (a.data.shopping_info = { is_show: 0 }),
          a.data?.new_tab_info?.outer_list &&
            a.data.new_tab_info.outer_list.length &&
            (a.data.new_tab_info.outer_list =
              a.data.new_tab_info.outer_list.filter((a) => 33 != a.biz_id)),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili live broadcast:` + a);
      }
      break;
    case /^https?:\/\/app\.bilibili\.com\/x\/resource\/top\/activity/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body);
        (a.data && ((a.data.hash = "ddgksf2013"), (a.data.online.icon = "")),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili right corner:` + a);
      }
      break;
    case /ecommerce-user\/get_shopping_info\?/.test($request.url):
      try {
        let a = JSON.parse(body);
        (a.data &&
          (a.data = {
            shopping_card_detail: {},
            bubbles_detail: {},
            recommend_card_detail: {},
            selected_goods: {},
            h5jump_popup: [],
          }),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili shopping info:` + a);
      }
      break;
    case /pgc\/page\/(bangumi|cinema\/tab\?)/.test($request.url):
      try {
        let a = JSON.parse(body);
        (a.result.modules.forEach((a) => {
          (a.style.startsWith("banner") &&
            (a.items = a.items.filter((a) => -1 != a.link.indexOf("play"))),
            a.style.startsWith("function") &&
              ((a.items = a.items.filter(
                (a) => -1 == a.blink.indexOf("bilibili.com"),
              )),
              [1283, 241, 1441, 1284].includes(a.module_id) && (a.items = [])),
            a.style.startsWith("tip") && (a.items = []));
        }),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili fanju:` + a);
      }
      break;
    case /^https:\/\/app\.bilibili\.com\/x\/v2\/splash\/list/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body);
        if (a.data && a.data.list)
          for (let b of a.data.list)
            ((b.duration = 0),
              (b.begin_time = 2240150400),
              (b.end_time = 2240150400));
        body = JSON.stringify(a);
      } catch (a) {
        console.log(`bilibili openad:` + a);
      }
      break;
    case /^https:\/\/api\.live\.bilibili\.com\/xlive\/app-interface\/v2\/index\/feed/.test(
      $request.url,
    ):
      try {
        let a = JSON.parse(body);
        (a.data &&
          a.data.card_list &&
          (a.data.card_list = a.data.card_list.filter(
            (a) => "banner_v1" != a.card_type,
          )),
          (body = JSON.stringify(a)));
      } catch (a) {
        console.log(`bilibili xlive:` + a);
      }
      break;
    default:
      $done({});
  }
  $done({ body });
} else $done({});
