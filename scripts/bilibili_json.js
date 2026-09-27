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

let body = $response.body;

function isAd(item) {
  if (!item || typeof item !== "object") return false;
  const goto = item.card_goto;
  return (
    Object.prototype.hasOwnProperty.call(item, "ad_info") ||
    item.type === "ad" ||
    goto === "ad" ||
    (typeof goto === "string" && goto.startsWith("ad_"))
  );
}

if (body) {
  try {
    const response = JSON.parse(body);
    let changed = false;

    if (/^https:\/\/app\.bilibili\.com\/x\/v2\/splash\/list(?:\?|$)/.test($request.url)) {
      if (Array.isArray(response.data?.list)) {
        for (const ad of response.data.list) {
          ad.duration = 0;
          ad.begin_time = 2240150400;
          ad.end_time = 2240150400;
          changed = true;
        }
      }
    } else if (/\/pgc\/season\/app\/related\/recommend\?/.test($request.url)) {
      if (Array.isArray(response.result?.cards)) {
        const cards = response.result.cards.filter((card) => card.type !== 2);
        if (cards.length !== response.result.cards.length) {
          response.result.cards = cards;
          changed = true;
        }
      }
    } else if (/\/ecommerce-user\/get_shopping_info\?/.test($request.url)) {
      if (response.data) {
        response.data = {
          shopping_card_detail: {},
          bubbles_detail: {},
          recommend_card_detail: {},
          selected_goods: {},
          h5jump_popup: [],
        };
        changed = true;
      }
    } else if (/\/xlive\/app-room\/v1\/index\/getInfoByRoom(?:\?|$)/.test($request.url)) {
      if (response.data?.shopping_info) {
        response.data.shopping_info = { is_show: 0 };
        changed = true;
      }
      if (Array.isArray(response.data?.new_tab_info?.outer_list)) {
        const tabs = response.data.new_tab_info.outer_list.filter(
          (tab) => tab.biz_id !== 33,
        );
        if (tabs.length !== response.data.new_tab_info.outer_list.length) {
          response.data.new_tab_info.outer_list = tabs;
          changed = true;
        }
      }
    } else if (/^https?:\/\/app\.bilibili\.com\/x\/v2\/account\/mine(?:\?|$)/.test($request.url)) {
      response.data?.sections_v2?.forEach((section) => {
        if (!Array.isArray(section.items)) return;
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
      });
    } else if (/^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index(?:\/story)?(?:\?|$)/.test($request.url)) {
      if (Array.isArray(response.data?.items)) {
        const items = [];
        for (const item of response.data.items) {
          if (isAd(item)) {
            changed = true;
            continue;
          }
          if (Array.isArray(item?.banner_item)) {
            const banner = item.banner_item.filter((entry) => !isAd(entry));
            if (banner.length !== item.banner_item.length) {
              changed = true;
              if (banner.length === 0) continue;
              items.push({ ...item, banner_item: banner });
              continue;
            }
          }
          items.push(item);
        }
        if (changed) response.data.items = items;
      }
    }

    if (changed) body = JSON.stringify(response);
  } catch (error) {
    console.log("bilibili adblock: " + error);
  }
}

$done({ body });
