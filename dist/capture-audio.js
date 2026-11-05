export const displayAudioOptions=()=>({video:true,audio:{suppressLocalAudioPlayback:false,restrictOwnAudio:false},preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'include'});
export async function requestDisplayAudio(devices=navigator.mediaDevices){
  if(typeof devices?.getDisplayMedia!=='function')throw new Error('此环境不支持标签页音频共享。请用 Windows Chrome 或 Edge 独立窗口打开网址，部分内嵌浏览器无法提供此功能。');
  let stream;try{stream=await devices.getDisplayMedia(displayAudioOptions());}catch(error){if(error.name==='NotAllowedError')throw new Error('标签页音频共享未获授权。若没有出现共享选择窗口，请改用 Windows Chrome / Edge 独立窗口；若出现窗口，请选择当前标签页并勾选音频。');throw error;}
  const audio=stream.getAudioTracks();
  if(!audio.length){stream.getTracks().forEach(t=>t.stop());throw new Error('共享来源没有音频。请重新选择“浏览器标签页”，并勾选“共享标签页音频”。');}
  const supported=devices.getSupportedConstraints?.()||{};
  if(supported.restrictOwnAudio)try{await audio[0].applyConstraints({restrictOwnAudio:false});}catch{/* Settings below remain visible to the caller so it can explain browser filtering. */}
  return stream;
}
