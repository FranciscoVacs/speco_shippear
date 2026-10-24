// react/jsx-runtime on top of the React UMD global (React 18's UMD build has no jsx-runtime): assistant-ui is compiled with the automatic runtime.
const React = window.React;
function jsx(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  return children === undefined ? React.createElement(type, rest) : React.createElement(type, rest, children);
}
function jsxs(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  return React.createElement(type, rest, ...(Array.isArray(children) ? children : [children]));
}
module.exports = { Fragment: React.Fragment, jsx, jsxs, jsxDEV: jsx };
