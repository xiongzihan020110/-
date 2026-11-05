export const LIVE_CAPTION_ID='__live_caption__';
export class DraftCaption {
  constructor(){this.original='';this.translation='';this.epoch=0;}
  set(text){text=String(text||'');if(!text||!text.startsWith(this.original)){this.translation='';this.epoch++;}this.original=text;return this;}
  token(){return{epoch:this.epoch,original:this.original};}
  apply(token,translation){if(!this.original||token.epoch!==this.epoch||!this.original.startsWith(token.original))return false;this.translation=String(translation);return true;}
}
export function captionTranslation(row){if(!row)return'';if(row.translation)return row.translation;if(row.state==='failed')return`翻译未完成：${row.error||'请重试'}`;return row.provisional?(row.previewEnabled?'临时译文生成中…':'语句确认后翻译…'):'正在翻译…';}
export function captionFrame(rows,selectedId,draft,previewEnabled=true){if(draft?.original)return{id:LIVE_CAPTION_ID,original:draft.original,translation:draft.translation,provisional:true,previewEnabled};return rows.find(r=>String(r.id)===String(selectedId))||null;}
