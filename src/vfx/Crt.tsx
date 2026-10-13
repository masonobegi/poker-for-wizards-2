import { memo } from 'react';
import './crt.css';

/**
 * The tube.
 *
 * Four stacked layers over the whole app, all of them `pointer-events: none`
 * and none of them known to anything underneath — see `crt.css` for what each
 * one is and which line of BasketRogue's `crt_overlay.gdshader` it comes from.
 *
 * It is a component rather than a few rules on `<body>` for one reason: the
 * blend modes have to apply to the composited page, which means the layers
 * must be siblings of the app's content at the very top of the stacking order,
 * and `::before`/`::after` on a shared ancestor cannot be made to sit there
 * reliably once a modal or an overlay raises its own z-index.
 */
function CrtBase() {
  return (
    <div className="crt" aria-hidden>
      <div className="crt__lines" />
      <div className="crt__glass" />
      <div className="crt__glare" />
      <div className="crt__hum" />
    </div>
  );
}

export const Crt = memo(CrtBase);
export default Crt;
