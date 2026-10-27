import { screen, within } from '@testing-library/react';

// Exercise the same per-row upload controls used by people in the editor.
export async function uploadVariantPhotos(user, selection) {
  for (const file of Array.isArray(selection) ? selection : [selection]) {
    const rows = screen.getAllByRole('group', { name: /^规格\d+$/ });
    let row = rows.find(element => !within(element).queryByRole('button', { name: /^移除图片 / }));
    if (!row) {
      await user.click(screen.getByRole('button', { name: '添加颜色', exact: true }));
      row = screen.getAllByRole('group', { name: /^规格\d+$/ }).at(-1);
    }
    await user.click(within(row).getByRole('button', { name: /^上传规格/ }));
    await user.upload(screen.getByLabelText('从相册选择图片'), file);
  }
}
