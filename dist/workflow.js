// Navigation is independent of media availability. Opening a workspace must not
// request a file, microphone or screen-sharing permission.
export function workflowView({view='live',active=false,busy=false,working=false,importing=false,hasLink=false,hasRows=false,hasMedia=false}={}){
 const review=view==='review';
 return {review,showCapture:!review,showPlayback:review&&!hasLink&&(hasMedia||hasRows),canReviewRecording:!review&&!active&&!busy&&!working&&!importing&&hasRows,
  primaryLabel:busy?'正在准备…':active?'■ 暂停翻译':working?'正在完成字幕…':'● 开始翻译',
  status:importing?'正在生成字幕':busy?'正在准备':active?'正在收音':working?'正在完成翻译':hasRows?'已暂停 · 可回听':hasLink?'视频已载入':hasMedia?'音视频已载入':review?'等待导入':'等待开始'};
}
