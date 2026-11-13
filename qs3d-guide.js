(() => {
  const toggle=document.createElement('button');
  toggle.id='qs3d-guide-toggle';toggle.type='button';toggle.textContent='❔ Hướng dẫn';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','qs3d-guide');
  const guide=document.createElement('aside');
  guide.id='qs3d-guide';guide.hidden=true;guide.setAttribute('aria-label','Hướng dẫn chơi QS3D');
  guide.innerHTML='<button id="qs3d-guide-close" type="button" aria-label="Đóng hướng dẫn">×</button><h2>🏡 Hòn Đảo Bình Yên</h2><p>Tự tạo một vùng đất với nhà, tường, đường, ao hồ, cầu và cây cối.</p><p>🖱️ <b>Chuột trái:</b> chọn, vẽ hoặc đặt vật thể.</p><p>🧭 <b>Chuột phải kéo</b> hoặc <kbd>Alt</kbd> + kéo trái: xoay góc nhìn.</p><p>🔎 <b>Cuộn chuột:</b> phóng to/thu nhỏ. <b>Giữ Shift + kéo:</b> di chuyển góc nhìn.</p><p>🎨 Dùng thanh công cụ trong game để dựng tường, thêm nhà, nước, đường và các chi tiết.</p><p>💾 Game có hoàn tác và xuất/nhập thiết kế JSON trong menu.</p><p class="qs3d-small">QS3D demo · Phái sinh từ <a href="https://github.com/FireTable/tiny-glade" target="_blank" rel="noopener noreferrer">FireTable/tiny-glade</a> (MIT). Trải nghiệm thử nghiệm; không phải bản game chính thức từ Reel.</p>';
  const setOpen=(open)=>{guide.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
  toggle.addEventListener('click',e=>{e.stopPropagation();setOpen(guide.hidden);});
  guide.querySelector('#qs3d-guide-close').addEventListener('click',e=>{e.stopPropagation();setOpen(false);});
  for(const eventName of ['pointerdown','mousedown','mouseup','wheel','touchstart','touchend'])guide.addEventListener(eventName,e=>e.stopPropagation(),{passive:eventName==='wheel'||eventName.startsWith('touch')});
  document.body.append(toggle,guide);
  if(!sessionStorage.getItem('qs3dGuideSeen')){setOpen(true);sessionStorage.setItem('qs3dGuideSeen','1');}
})();
