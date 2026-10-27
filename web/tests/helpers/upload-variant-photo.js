import { screen, within } from '@testing-library/react';

// Exercise the same per-row upload controls used by people in the editor.
export async function uploadVariantPhotos(user, selection) {
  for (const file of Array.isArray(selection) ? selection : [selection]) {
    const rows = screen.getAllByRole('group', { name: /^规格\d+$/ });
    let row = rows.find(element => !within(element).queryByRole('button', { name: /^移除图片 / }));
    if (!row) {
      await addVariant(user);
      row = screen.getAllByRole('group', { name: /^规格\d+$/ }).at(-1);
    }
    await user.click(within(row).getByRole('button', { name: /^上传规格/ }));
    await user.upload(screen.getByLabelText('从相册选择图片'), file);
  }
}

export async function openVariantManagement(user) {
  const edit = screen.queryByRole('button', { name: '编辑规格', exact: true });
  if (edit) await user.click(edit);
}
export async function showVariantInputs(user) {
  const fill = screen.queryByRole('button', { name: '返回规格填写', exact: true });
  if (fill) await user.click(fill);
}
export async function addVariant(user) {
  await openVariantManagement(user);
  await showVariantInputs(user);
  await user.click(screen.getByRole('button', { name: '添加颜色', exact: true }));
}
export async function startVariantSort(user) {
  await openVariantManagement(user);
  const sort = screen.queryByRole('button', { name: '排序规格', exact: true });
  if (sort) await user.click(sort);
}
