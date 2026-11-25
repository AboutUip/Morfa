let lockCount = 0;
let initialInert = false;

/**
 * 以引用计数方式锁住应用根节点，支持多个弹窗在过渡期间重叠。
 * 只有最后一个弹窗释放后才恢复进入前的 inert 状态。
 */
export function lockBackground(): () => void {
  const root = document.getElementById("root");
  if (!root) return () => {};

  if (lockCount === 0) {
    initialInert = root.inert;
  }

  lockCount += 1;
  root.inert = true;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);

    if (lockCount === 0) {
      const current = document.getElementById("root");
      if (current) current.inert = initialInert;
    }
  };
}
