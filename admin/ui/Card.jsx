/* Белая карточка с общей границей. Экраны кладут в неё свой текст. */
function Card({ as: Tag = "section", className = "", children, ...rest }) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export { Card };
