import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getItemVariants, getVariantQuantity, MAX_ITEM_VARIANTS, withVariantSummary } from '../../../../shared/item-variants.mjs';
import { getItemImageIds, MAX_ITEM_IMAGES, withImageSummary } from '../../../../shared/item-images.mjs';

import {
  buildNodePath,
  completeSmartTagInput,
  getChildEntries,
  getItemLocationIds,
  getNextTagSuggestions,
  getNodeLineage,
  getTagPrefixForCategory,
  isItemPrivate,
  normalizeTagCodes
} from '../../lib/project-data';
import { normalizeItemDetailInput } from './item-detail-text';
import { createEmptyItemDraft } from './item-gallery-selectors';
import { useImageAccess } from '../web/ImageAccessContext';
import ItemVariantFields from './ItemVariantFields';
import ItemInformationPage from './ItemInformationPage';
import ItemImageEditor from './ItemImageEditor';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
let pendingImageSequence = 0;

let variantRowSequence = 0;
function createVariantRow(row = { color: '', size: '', isPackaged: false }) {
  return { ...row, rowKey: ++variantRowSequence };
}

function normalizeItem(item, categories, locations, mode = 'edit') {
  if (item) {
    return {
      ...(mode === 'copy' ? {} : { id: item.id }),
      barcode: item.barcode || item.code || '',
      code: item.barcode || item.code || '',
      name: item.name || '',
      notes: item.notes || '',
      brand: item.brand || '',
      specification: normalizeItemDetailInput(item.specification),
      quantity: item.quantity || '',
      variants: getItemVariants(item).map(createVariantRow),
      categoryId: item.categoryId || '',
      locationId: item.locationId || '',
      locationIds: getItemLocationIds(item).length ? getItemLocationIds(item) : [''],
      imagePaths: getItemImageIds(item),
      imagePath: getItemImageIds(item)[0] || '',
      isPrivate: mode === 'copy' ? isItemPrivate(item, { categories, locations }) : Boolean(item.isPrivate),
      isPackaged: Boolean(item.isPackaged),
      tags: normalizeTagCodes(item.tags)
    };
  }

  const empty = createEmptyItemDraft(categories, locations);
  return { ...empty, imagePaths: [], imagePath: '', variants: getItemVariants(empty).map(createVariantRow), locationIds: [empty.locationId || ''], isPrivate: false };
}

function buildCategorySelection(categories, categoryId) {
  const lineage = getNodeLineage(categories, categoryId);

  return {
    mainCategoryId: lineage[0]?.id || '',
    subCategoryId: lineage[1]?.id || ''
  };
}

function buildLocationSelection(locations, locationId) {
  const lineage = getNodeLineage(locations, locationId);

  return {
    level1Id: lineage[0]?.id || '',
    level2Id: lineage[1]?.id || '',
    level3Id: lineage[2]?.id || ''
  };
}

export default function ItemEditorModal({
  open,
  mode = 'edit',
  item = null,
  categories = [],
  locations = [],
  availableTags = [],
  tagPrefixes = {},
  canManagePrivacy = true,
  onSave,
  onClose,
  onDelete,
  onCopy
}) {
  const [draft, setDraft] = useState(() => normalizeItem(item, categories, locations, mode));
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [imageFeedback, setImageFeedback] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [pendingImages, setPendingImages] = useState([]);
  const pendingImagesRef = useRef([]);
  const [activeTab, setActiveTab] = useState('edit');
  const tabsRef = useRef(null);
  const stagedBrowserUploadRef = useRef(new Map());
  const stagedImageCopyRef = useRef(new Map());
  const editorGenerationRef = useRef(0);
  const browserEditorSessionRef = useRef(null);
  const imageAccess = useImageAccess();
  const fileInputRef = useRef(null);

  useLayoutEffect(() => {
    editorGenerationRef.current += 1;
    replacePendingImages([]);
    stagedBrowserUploadRef.current.clear();
    stagedImageCopyRef.current.clear();
    return () => { editorGenerationRef.current += 1; };
  }, [open, mode, item?.id, imageAccess]);

  useEffect(() => () => {
    for (const row of pendingImagesRef.current) URL.revokeObjectURL(row.url);
    pendingImagesRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) {
      browserEditorSessionRef.current = null;
      if (imageAccess) {
        replacePendingImages([]);
        stagedBrowserUploadRef.current.clear();
        stagedImageCopyRef.current.clear();
      }
      return;
    }

    if (imageAccess) {
      // Project saves refresh object identities without ending the open browser draft.
      const session = browserEditorSessionRef.current;
      if (session?.access === imageAccess && session.mode === mode && session.itemId === item?.id) {
        return;
      }
      browserEditorSessionRef.current = { access: imageAccess, mode, itemId: item?.id };
    } else {
      browserEditorSessionRef.current = null;
    }
    setDraft(normalizeItem(item, categories, locations, mode));
    setDirtyDraft(false);
    setActiveTab('edit');
    setTagInput('');
    setImageFeedback({ type: '', message: '' });
    setSaving(false);
    replacePendingImages([]);
    stagedBrowserUploadRef.current.clear();
    stagedImageCopyRef.current.clear();
  }, [open, item, categories, locations, mode, imageAccess]);

  const categorySelection = useMemo(
    () => buildCategorySelection(categories, draft.categoryId),
    [categories, draft.categoryId]
  );
  const mainCategoryOptions = useMemo(() => getChildEntries(categories, null), [categories]);
  const subCategoryOptions = useMemo(
    () => (categorySelection.mainCategoryId ? getChildEntries(categories, categorySelection.mainCategoryId) : []),
    [categories, categorySelection.mainCategoryId]
  );
  const level1Options = useMemo(() => getChildEntries(locations, null), [locations]);
  const assignedLocationIds = [...new Set(draft.locationIds.filter(Boolean))];
  const imageOptions = [
    ...draft.imagePaths.map((id, index) => ({ id, savedId: id, label: `图片${index + 1}` })),
    ...pendingImages.map(row => ({ id: `pending:${row.key}`, url: row.url, label: row.file.name }))
  ];
  const inheritedPrivate = isItemPrivate(
    { ...draft, locationIds: assignedLocationIds, isPrivate: false },
    { categories, locations }
  );
  const tagSuggestions = useMemo(
    () =>
      getNextTagSuggestions(
        [...normalizeTagCodes(availableTags), ...normalizeTagCodes(draft.tags)],
        4,
        getTagPrefixForCategory(draft.categoryId, categories, tagPrefixes)
      ),
    [availableTags, categories, draft.categoryId, draft.tags, tagPrefixes]
  );
  if (!open) {
    return null;
  }

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirtyDraft(true);
  }

  function updateVariant(rowKey, patch) {
    updateDraft({ variants: draft.variants.map(row => row.rowKey === rowKey ? { ...row, ...patch } : row) });
  }

  function addVariant() {
    if (draft.variants.length >= MAX_ITEM_VARIANTS) return;
    const used = new Set(draft.variants.map(row => row.imageId));
    const imageId = imageOptions.find(option => !used.has(option.id))?.id || '';
    updateDraft({ variants: [...draft.variants, createVariantRow({ color: '', size: '', isPackaged: false, quantity: '', imageId })] });
  }

  function removeVariant(rowKey) {
    if (draft.variants.length <= 1) return;
    updateDraft({ variants: draft.variants.filter(row => row.rowKey !== rowKey) });
  }

  function handleTabKeyDown(event) {
    const index = activeTab === 'edit' ? 0 : 1;
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') nextIndex = 1 - index;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = 1;
    else return;
    event.preventDefault();
    setActiveTab(nextIndex === 0 ? 'edit' : 'information');
    tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  function replacePendingImages(nextImages) {
    const retained = new Set(nextImages.map(row => row.key));
    for (const row of pendingImagesRef.current) {
      if (!retained.has(row.key)) {
        URL.revokeObjectURL(row.url);
        stagedBrowserUploadRef.current.delete(row.key);
      }
    }
    pendingImagesRef.current = nextImages;
    setPendingImages(nextImages);
  }

  function handleBrowserFile(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || saving || !imageAccess) return;
    const failure = draft.imagePaths.length + pendingImages.length + files.length > MAX_ITEM_IMAGES
      ? `每件物品最多选择 ${MAX_ITEM_IMAGES} 张图片`
      : files.some(file => !IMAGE_TYPES.has(file.type))
        ? '图片格式仅支持 PNG、JPEG、WebP、GIF 或 BMP'
        : files.some(file => !file.size || file.size > MAX_IMAGE_BYTES)
          ? '每张图片不能为空且不能超过 20MB'
          : '';
    if (failure) {
      setImageFeedback({ type: 'error', message: failure });
      return;
    }
    const added = [];
    try {
      for (const file of files) added.push({ key: ++pendingImageSequence, file, url: URL.createObjectURL(file) });
    } catch {
      for (const row of added) URL.revokeObjectURL(row.url);
      setImageFeedback({ type: 'error', message: '图片预览失败，请重新选择' });
      return;
    }
    replacePendingImages([...pendingImagesRef.current, ...added]);
    const available = added.map(row => `pending:${row.key}`);
    setDraft(current => ({ ...current, variants: current.variants.map(row => !row.imageId && available.length ? { ...row, imageId: available.shift() } : row) }));
    setDirtyDraft(true);
    setImageFeedback({ type: '', message: '' });
  }

  function removeSavedImage(imageId) {
    if (saving) return;
    const imagePaths = draft.imagePaths.filter(id => id !== imageId);
    stagedImageCopyRef.current.delete(imageId);
    updateDraft({ imagePaths, imagePath: imagePaths[0] || '', variants: draft.variants.map(row => row.imageId === imageId ? { ...row, imageId: '' } : row) });
  }

  function removePendingImage(key) {
    if (saving) return;
    replacePendingImages(pendingImagesRef.current.filter(row => row.key !== key));
    setDraft(current => ({ ...current, variants: current.variants.map(row => row.imageId === `pending:${key}` ? { ...row, imageId: '' } : row) }));
    setDirtyDraft(true);
  }

  function updateDraftTags(tags) {
    updateDraft({ tags: normalizeTagCodes(tags) });
  }

  function addDraftTag(tag) {
    const cleanTag = completeSmartTagInput(tag, [...normalizeTagCodes(availableTags), ...normalizeTagCodes(draft.tags)]);
    if (!cleanTag) {
      return;
    }

    updateDraftTags([...(draft.tags || []), cleanTag]);
    setTagInput('');
  }

  function removeDraftTag(tag) {
    updateDraftTags((draft.tags || []).filter((item) => item !== tag));
  }

  function handleTagInputKeyDown(event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    addDraftTag(tagInput);
  }

  function handleMainCategoryChange(value) {
    updateDraft({
      categoryId: value || ''
    });
  }

  function handleSubCategoryChange(value) {
    updateDraft({
      categoryId: value || categorySelection.mainCategoryId || ''
    });
  }

  function updateLocation(index, locationId) {
    const locationIds = draft.locationIds.map((id, rowIndex) => rowIndex === index ? locationId : id);
    updateDraft({ locationIds, locationId: locationIds[0] || '' });
  }

  function removeLocation(index) {
    const remaining = draft.locationIds.filter((_, rowIndex) => rowIndex !== index);
    const locationIds = remaining.length ? remaining : [''];
    updateDraft({ locationIds, locationId: locationIds[0] || '' });
  }

  function requestClose() {
    if (saving) return;
    if (dirtyDraft && !window.confirm('当前物品还有未保存修改，确定关闭吗？')) {
      return;
    }

    onClose?.();
  }

  function requestCopy() {
    if (saving || !imageAccess || !onCopy) return;
    if (dirtyDraft && !window.confirm('复制将使用已保存的物品内容，当前修改不会带入。继续复制？')) return;
    onCopy();
  }

  async function handleSave() {
    if (saving) {
      return;
    }

    const saveGeneration = editorGenerationRef.current;
    const isCurrentSave = () => editorGenerationRef.current === saveGeneration;

    setSaving(true);
    setImageFeedback({ type: '', message: '' });

    try {
      if (!draft.variants.length) throw new Error('原数量无法自动转换，请按实际件数添加规格后再保存');
      if (mode === 'copy' && draft.imagePaths.length && !imageAccess) throw new Error('图片复制暂不可用，请重新打开物品后重试');
      const nextItem = withVariantSummary({
        ...(mode === 'copy' ? {} : item),
        ...draft,
        notes: draft.notes,
        variants: draft.variants.map(row => ({ color: row.color, size: row.size, isPackaged: row.isPackaged, quantity: getVariantQuantity(row), imageId: row.imageId || '' })),
        specification: normalizeItemDetailInput(draft.specification),
        locationIds: assignedLocationIds,
        locationId: assignedLocationIds[0] || null,
        tags: normalizeTagCodes(draft.tags)
      });
      const optionIds = new Set(imageOptions.map(option => option.id));
      if (nextItem.variants.some(row => row.imageId && !optionIds.has(row.imageId))) throw new Error('关联的图片已移除，请重新选择');
      if (imageAccess) {
        if (!draft.name.trim()) throw new Error('请填写物品名称');
        if (!draft.categoryId || !categories.some((category) => category.id === draft.categoryId)) {
          throw new Error('请先选择分类');
        }
        const imagePaths = [], imageMap = new Map();
        for (const imageId of draft.imagePaths) {
          if (mode !== 'copy') {
            imagePaths.push(imageId);
            imageMap.set(imageId, imageId);
            continue;
          }
          let copiedId = stagedImageCopyRef.current.get(imageId);
          if (!copiedId) {
            const result = await imageAccess.copy(imageId);
            if (!isCurrentSave()) return;
            if (!result?.imageId || result.imageId === imageId || draft.imagePaths.includes(result.imageId)) throw new Error('图片复制失败，请重试');
            copiedId = result.imageId;
            stagedImageCopyRef.current.set(imageId, copiedId);
          }
          imagePaths.push(copiedId);
          imageMap.set(imageId, copiedId);
        }
        for (const row of pendingImages) {
          let uploadedId = stagedBrowserUploadRef.current.get(row.key);
          if (!uploadedId) {
            const result = await imageAccess.upload(row.file);
            if (!isCurrentSave()) return;
            if (!result?.imageId) throw new Error('图片上传失败，请重试');
            uploadedId = result.imageId;
            stagedBrowserUploadRef.current.set(row.key, uploadedId);
          }
          imagePaths.push(uploadedId);
          imageMap.set(`pending:${row.key}`, uploadedId);
        }
        Object.assign(nextItem, withImageSummary({ imagePaths }));
        nextItem.variants = nextItem.variants.map(row => ({ ...row, imageId: row.imageId ? imageMap.get(row.imageId) : '' }));
      }
      if (!isCurrentSave()) return;
      nextItem.variants = getItemVariants(nextItem);
      await onSave?.(nextItem);
      if (!isCurrentSave()) return;
      setDraft(current => ({ ...current, imagePaths: nextItem.imagePaths, imagePath: nextItem.imagePath, variants: nextItem.variants.map((row, index) => ({ ...row, rowKey: current.variants[index].rowKey })) }));
      replacePendingImages([]);
      stagedBrowserUploadRef.current.clear();
      stagedImageCopyRef.current.clear();
      setDirtyDraft(false);
    } catch (error) {
      if (isCurrentSave()) setImageFeedback({ type: 'error', message: error?.message || '物品保存失败' });
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  }

  function handleDialogKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="dialog-backdrop item-editor-backdrop web-item-editor-backdrop" role="presentation">
      <div
        className="dialog-card item-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="dialog-header item-editor-modal__header">
          <div>
            <h2 id="item-editor-title">{mode === 'copy' ? '复制新增' : mode === 'create' ? '新增物品' : draft.name || '未命名物品'}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={requestClose} disabled={saving} aria-label="关闭物品弹窗">
            关闭
          </button>
        </div>

        <div className="item-editor-modal__toolbar">
          <div className="item-editor-modal__tabs" role="tablist" aria-label="物品页面" ref={tabsRef} onKeyDown={handleTabKeyDown}>
            <button type="button" role="tab" id="item-editor-edit-tab" aria-controls="item-editor-edit-panel" aria-selected={activeTab === 'edit'} tabIndex={activeTab === 'edit' ? 0 : -1} onClick={() => setActiveTab('edit')}>编辑页</button>
            <button type="button" role="tab" id="item-editor-information-tab" aria-controls="item-editor-information-panel" aria-selected={activeTab === 'information'} tabIndex={activeTab === 'information' ? 0 : -1} onClick={() => setActiveTab('information')}>信息页</button>
          </div>
          <button className="secondary-button item-editor-modal__choose-images" type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>选择图片</button>
          <input hidden ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="从相册选择图片" disabled={saving} onChange={handleBrowserFile} />
        </div>

        <div className="item-editor-modal__body">
          {imageFeedback.message ? (
            <p role={imageFeedback.type === 'error' ? 'alert' : 'status'} className={`image-feedback ${imageFeedback.type === 'error' ? 'is-error' : 'is-success'}`}>
              {imageFeedback.message}
            </p>
          ) : null}
          <div className="item-editor-modal__edit-panel" role="tabpanel" id="item-editor-edit-panel" aria-labelledby="item-editor-edit-tab" hidden={activeTab !== 'edit'}>
          <section className="item-editor-modal__media">
            <ItemImageEditor imageIds={draft.imagePaths} pendingImages={pendingImages} saving={saving}
              onRemoveSaved={removeSavedImage} onRemovePending={removePendingImage} />
            {canManagePrivacy ? <div className="item-editor-modal__media-actions">
              <label className="web-item-option-control">
                <input type="checkbox" checked={draft.isPrivate || inheritedPrivate} disabled={saving || inheritedPrivate}
                  aria-describedby={inheritedPrivate ? 'item-privacy-inheritance' : undefined}
                  onChange={event => updateDraft({ isPrivate: event.target.checked })} />
                <span>隐私区</span>
              </label>
              {inheritedPrivate ? <p id="item-privacy-inheritance" className="privacy-inheritance-hint">所选分类或位置属于隐私区</p> : null}
            </div> : null}
          </section>

          <fieldset className="item-editor-modal__form" disabled={saving}>
            <div className="form-row">
              <label className="field">
                <span>名称</span>
                <input autoFocus value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
              </label>
            </div>

            <ItemVariantFields variants={draft.variants} imageOptions={imageOptions} maxVariants={MAX_ITEM_VARIANTS}
              onChange={updateVariant} onAdd={addVariant} onRemove={removeVariant} />

            <div className="form-row form-row--2 item-editor-modal__paired-row">
              <label className="field">
                <span>品牌</span>
                <input value={draft.brand} onChange={(event) => updateDraft({ brand: event.target.value })} />
              </label>
              <label className="field">
                <span>款式</span>
                <input placeholder="印花 镂空" value={draft.specification} onChange={(event) => updateDraft({ specification: event.target.value })} onBlur={(event) => { const specification = normalizeItemDetailInput(event.target.value); if (specification !== draft.specification) updateDraft({ specification }); }} />
              </label>
            </div>

            <div className="form-row form-row--2 item-editor-modal__paired-row">
              <label className="field">
                <span>主分类</span>
                <select value={categorySelection.mainCategoryId} onChange={(event) => handleMainCategoryChange(event.target.value)}>
                  <option value="">未选择</option>
                  {mainCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>子分类</span>
                <select
                  value={categorySelection.subCategoryId}
                  onChange={(event) => handleSubCategoryChange(event.target.value)}
                  disabled={!subCategoryOptions.length}
                >
                  <option value="">{subCategoryOptions.length ? '未选择' : '无子分类'}</option>
                  {subCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <section className="item-location-editor" aria-label="物品存放位置">
              {draft.locationIds.map((locationId, index) => {
                const selection = buildLocationSelection(locations, locationId);
                const level2Options = selection.level1Id ? getChildEntries(locations, selection.level1Id) : [];
                const level3Options = selection.level2Id ? getChildEntries(locations, selection.level2Id) : [];
                return <div className="item-location-editor__row" role="group" aria-label={`存放位置 ${index + 1}`} key={index}>
                  <div className="form-row form-row--3 item-location-editor__selects">
                    <label className="field">
                      <span>一级位置</span>
                      <select value={selection.level1Id} onChange={event => updateLocation(index, event.target.value)}>
                        <option value="">未选择</option>
                        {level1Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>二级位置</span>
                      <select value={selection.level2Id} disabled={!level2Options.length}
                        onChange={event => updateLocation(index, event.target.value || selection.level1Id)}>
                        <option value="">{level2Options.length ? '未选择' : '无二级位置'}</option>
                        {level2Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>三级位置</span>
                      <select value={selection.level3Id} disabled={!level3Options.length}
                        onChange={event => updateLocation(index, event.target.value || selection.level2Id || selection.level1Id)}>
                        <option value="">{level3Options.length ? '未选择' : '无三级位置'}</option>
                        {level3Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="item-location-editor__controls" role="group" aria-label={`位置 ${index + 1} 操作`}>
                    {index === draft.locationIds.length - 1 ? <button type="button" className="item-location-editor__add" aria-label="添加位置" title="添加存放位置"
                      disabled={draft.locationIds.length >= 32 || draft.locationIds.includes('')}
                      onClick={() => updateDraft({ locationIds: [...draft.locationIds, ''] })}>＋</button> : null}
                    <button type="button" className="item-location-editor__remove" aria-label={`移除位置 ${index + 1}`} title="移除存放位置"
                      disabled={draft.locationIds.length === 1 && !locationId} onClick={() => removeLocation(index)}>×</button>
                  </div>
                </div>;
              })}
            </section>

            <section className="tag-editor-panel tag-editor-panel--compact" aria-label="物品标签">
              <div className="tag-editor-panel__header">
                <span>标签</span>
              </div>
              <div className="tag-editor-panel__selected" aria-label="已选标签">
                {normalizeTagCodes(draft.tags).length ? (
                  normalizeTagCodes(draft.tags).map((tag) => (
                    <button
                      key={tag}
                      className="tag-chip tag-chip--selected"
                      type="button"
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => removeDraftTag(tag)}
                    >
                      {tag}
                    </button>
                  ))
                ) : (
                  <span className="tag-editor-panel__empty">未贴标签</span>
                )}
              </div>
              <div className="tag-editor-panel__input-row">
                <label className="field">
                  <span>新增标签</span>
                  <input
                    aria-label="新增标签"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="例如：BG-001、GJ-003、SN-002"
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => addDraftTag(tagInput)} disabled={!tagInput.trim()}>
                  添加
                </button>
              </div>
              {tagSuggestions.length ? (
                <div className="tag-editor-panel__suggestions" aria-label="推荐标签">
                  {tagSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.tag}
                      className="tag-chip tag-chip--suggested"
                      type="button"
                      aria-label={`推荐标签 ${suggestion.tag}`}
                      disabled={normalizeTagCodes(draft.tags).includes(suggestion.tag)}
                      onClick={() => addDraftTag(suggestion.tag)}
                    >
                      {suggestion.tag}
                    </button>
                  ))}
                </div>
              ) : null}
              {availableTags.length ? (
                <div className="tag-editor-panel__available" aria-label="可选标签">
                  {normalizeTagCodes(availableTags).map((tag) => (
                    <button
                      key={tag}
                      className="tag-chip"
                      type="button"
                      aria-label={`选择标签 ${tag}`}
                      disabled={normalizeTagCodes(draft.tags).includes(tag)}
                      onClick={() => addDraftTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

          </fieldset>
          </div>
          <section role="tabpanel" id="item-editor-information-panel" aria-labelledby="item-editor-information-tab" hidden={activeTab !== 'information'}>
            {activeTab === 'information' ? <ItemInformationPage variants={draft.variants} imageOptions={imageOptions} categoryPath={buildNodePath(categories, draft.categoryId)} locationPaths={assignedLocationIds.map(id => buildNodePath(locations, id)).filter(Boolean)} /> : null}
          </section>
        </div>

        <div className="dialog-actions item-editor-modal__actions">
          <div className="item-editor-modal__record-actions">
            {mode === 'edit' && onCopy ? (
              <button className="secondary-button" type="button" onClick={requestCopy} disabled={saving}>复制新增</button>
            ) : null}
            {mode === 'edit' ? (
              <button
                className="ghost-button danger-button"
                type="button"
                onClick={() => {
                  onDelete?.(item?.id);
                }}
                disabled={saving}
              >
                删除物品
              </button>
            ) : null}
          </div>
          <div className="item-editor-modal__action-group">
            <button className="ghost-button" type="button" onClick={requestClose} disabled={saving}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
