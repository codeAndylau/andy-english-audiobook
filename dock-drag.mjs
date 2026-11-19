export function attachDockDrag(button) {
  let side = 'right', top = null, drag = null, suppressClick = false;
  function limits() {
    const rect = button.getBoundingClientRect();
    const maxY = Math.max(0, window.innerHeight - rect.height - 8);
    return {maxX: Math.max(0, document.documentElement.clientWidth - rect.width), minY: Math.min(maxY, matchMedia('(max-width:760px)').matches ? 68 : 8), maxY};
  }
  function place(x, y) {
    const {maxX, minY, maxY} = limits();
    button.style.left = `${Math.max(0, Math.min(maxX, x))}px`;
    button.style.right = 'auto';
    top = Math.max(minY, Math.min(maxY, y));
    button.style.top = `${top}px`;
  }
  function refresh() {
    if (button.hidden || !button.getClientRects().length) return;
    place(side === 'left' ? 0 : limits().maxX, top ?? window.innerHeight * .42);
    button.dataset.side = side;
    button.textContent = side === 'left' ? '跟读 ›' : '‹ 跟读';
  }
  function finish(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const ended = drag;
    drag = null;
    if (ended.moved) {
      side = parseFloat(button.style.left) < limits().maxX / 2 ? 'left' : 'right';
      suppressClick = event?.type === 'pointerup';
    }
    button.classList.toggle('is-dragging', false);
    if (button.hasPointerCapture(ended.id)) button.releasePointerCapture(ended.id);
    refresh();
  }
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    suppressClick = false;
    const rect = button.getBoundingClientRect();
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top, moved:false};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    button.classList.toggle('is-dragging', true);
    place(drag.left + dx, drag.top + dy);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, finish);
  // Drag-generated clicks must not reach the existing panel-open handler.
  button.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    suppressClick = false;
  }, true);
  window.addEventListener('resize', () => { finish(); refresh(); });
  return refresh;
}
