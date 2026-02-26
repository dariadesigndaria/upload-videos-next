'use client';

import { SpriteIcon } from '@yachtway/design-system/src/components/common/sprite-icon';
import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_VIDEOS = 5;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const ACCEPT_VIDEO_TYPES = '.mp4,.mov,.webm,.mpeg,video/*';

type VideoSource = 'upload' | 'youtube';
type MarqueeSelectionMode = 'replace' | 'add' | 'toggle' | 'remove';

type VideoCard = {
  embedUrl?: string;
  id: string;
  isObjectUrl: boolean;
  name: string;
  source: VideoSource;
  src: string;
  thumbnail?: string;
  youtubeUrl?: string;
};

type SelectionBox = {
  height: number;
  left: number;
  top: number;
  width: number;
};

let nextVideoId = 0;
const createVideoId = () => {
  nextVideoId += 1;
  return `video-${Date.now()}-${nextVideoId}`;
};

const isAcceptedVideo = (file: File) => {
  if (file.type.startsWith('video/')) {
    return true;
  }

  return /\.(mp4|mov|webm|mpeg)$/i.test(file.name);
};

const isYoutubeHost = (hostname: string) => {
  return hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtu.be';
};

const parseYouTubeId = (rawValue: string): string | null => {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  const tryParse = (candidate: string) => {
    try {
      return new URL(candidate);
    } catch {
      return null;
    }
  };

  let url = tryParse(value);
  if (!url) {
    url = tryParse(`https://${value}`);
  }

  if (!url || !isYoutubeHost(url.hostname)) {
    return null;
  }

  let id: string | null = null;

  if (url.hostname === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else if (url.pathname.startsWith('/embed/')) {
    id = url.pathname.split('/')[2] ?? null;
  } else if (url.pathname.startsWith('/shorts/')) {
    id = url.pathname.split('/')[2] ?? null;
  }

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return null;
  }

  return id;
};

const createYoutubeVideoCard = (url: string): VideoCard | null => {
  const id = parseYouTubeId(url);
  if (!id) {
    return null;
  }

  return {
    embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
    id: createVideoId(),
    isObjectUrl: false,
    name: `YouTube ${id}`,
    source: 'youtube',
    src: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    youtubeUrl: url.trim(),
  };
};

const isMarqueeInteractiveTarget = (target: HTMLElement) => {
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, option, iframe, video, [role='button'], [data-no-marquee='true'], .videoInteractive, .youtubeModalOverlay, .playerOverlay",
    ),
  );
};

export default function Page() {
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [isDropActive, setIsDropActive] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [menuVideoId, setMenuVideoId] = useState<string | null>(null);
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [youtubeLinks, setYoutubeLinks] = useState<string[]>(['']);
  const [youtubeErrors, setYoutubeErrors] = useState<string[]>(['']);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [playerVideoId, setPlayerVideoId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const addMenuWrapRef = useRef<HTMLDivElement>(null);
  const videoGridRef = useRef<HTMLDivElement>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const suppressCardClickRef = useRef(false);
  const isMarqueeSelectingRef = useRef(false);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeArmedRef = useRef(false);
  const marqueeStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeSelectionModeRef = useRef<MarqueeSelectionMode>('replace');
  const marqueeBaselineSelectionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    selectedIdsRef.current = selectedVideoIds;
  }, [selectedVideoIds]);

  const clearSelection = useCallback(() => {
    setSelectedVideoIds((prev) => (prev.size ? new Set() : prev));
  }, []);

  const revokeVideoUrl = useCallback((video: VideoCard | undefined) => {
    if (!video || !video.isObjectUrl) {
      return;
    }

    if (!objectUrlsRef.current.has(video.src)) {
      return;
    }

    URL.revokeObjectURL(video.src);
    objectUrlsRef.current.delete(video.src);
  }, []);

  const deleteByIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) {
        return;
      }

      setVideos((prev) => {
        prev.forEach((video) => {
          if (ids.has(video.id)) {
            revokeVideoUrl(video);
          }
        });

        return prev.filter((video) => !ids.has(video.id));
      });

      setSelectedVideoIds((prev) => {
        if (prev.size === 0) {
          return prev;
        }

        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      setPlayerVideoId((prev) => (prev && ids.has(prev) ? null : prev));
      setMenuVideoId((prev) => (prev && ids.has(prev) ? null : prev));
    },
    [revokeVideoUrl],
  );

  const appendFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);

    const acceptedByType = fileArray.filter(isAcceptedVideo);
    const accepted = acceptedByType.filter((file) => file.size <= MAX_FILE_SIZE_BYTES);

    const skippedType = fileArray.length - acceptedByType.length;
    const skippedSize = acceptedByType.length - accepted.length;

    setVideos((prev) => {
      const remainingSlots = MAX_VIDEOS - prev.length;
      if (remainingSlots <= 0) {
        setUploadNotice('Video limit reached. Maximum 5 videos.');
        return prev;
      }

      const toAdd = accepted.slice(0, remainingSlots).map((file) => {
        const src = URL.createObjectURL(file);
        objectUrlsRef.current.add(src);

        return {
          id: createVideoId(),
          isObjectUrl: true,
          name: file.name,
          source: 'upload' as const,
          src,
        };
      });

      const skippedByLimit = Math.max(0, accepted.length - remainingSlots);
      if (skippedType > 0 || skippedSize > 0 || skippedByLimit > 0) {
        const parts: string[] = [];
        if (skippedType > 0) {
          parts.push(`${skippedType} unsupported format`);
        }
        if (skippedSize > 0) {
          parts.push(`${skippedSize} over 200MB`);
        }
        if (skippedByLimit > 0) {
          parts.push(`${skippedByLimit} over limit`);
        }

        setUploadNotice(`Some videos were skipped: ${parts.join(', ')}.`);
      } else {
        setUploadNotice(null);
      }

      return [...prev, ...toAdd];
    });
  }, []);

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(event.target.files);
    }

    event.currentTarget.value = '';
  };

  const handleDropZoneClick = () => {
    if (videos.length >= MAX_VIDEOS) {
      setUploadNotice('Video limit reached. Maximum 5 videos.');
      return;
    }

    setIsAddMenuOpen(false);
    setMenuVideoId(null);
    fileInputRef.current?.click();
  };

  const handleDropZoneDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropActive(true);
  };

  const handleDropZoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDropZoneDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDropActive(false);
    }
  };

  const handleDropZoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDropActive(false);

    if (event.dataTransfer.files.length > 0) {
      appendFiles(event.dataTransfer.files);
    }
  };

  const handleSetAsCover = (videoId: string) => {
    setVideos((prev) => {
      const index = prev.findIndex((video) => video.id === videoId);
      if (index <= 0) {
        return prev;
      }

      const next = [...prev];
      const [cover] = next.splice(index, 1);
      next.unshift(cover);
      return next;
    });
  };

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }

      return next;
    });
  };

  const updateMarqueeSelection = useCallback((startX: number, startY: number, currentX: number, currentY: number) => {
    const grid = videoGridRef.current;
    if (!grid) {
      return;
    }

    const selectionLeft = Math.min(startX, currentX);
    const selectionTop = Math.min(startY, currentY);
    const selectionRight = Math.max(startX, currentX);
    const selectionBottom = Math.max(startY, currentY);

    setSelectionBox({
      height: selectionBottom - selectionTop,
      left: selectionLeft,
      top: selectionTop,
      width: selectionRight - selectionLeft,
    });

    const intersectingSelection = new Set<string>();
    const cards = grid.querySelectorAll<HTMLElement>('[data-video-id]');

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const intersects =
        rect.left < selectionRight &&
        rect.right > selectionLeft &&
        rect.top < selectionBottom &&
        rect.bottom > selectionTop;

      if (!intersects) {
        return;
      }

      const videoId = card.dataset.videoId;
      if (videoId) {
        intersectingSelection.add(videoId);
      }
    });

    const baseline = marqueeBaselineSelectionRef.current;
    const mode = marqueeSelectionModeRef.current;

    if (mode === 'add') {
      const next = new Set(baseline);
      intersectingSelection.forEach((id) => next.add(id));
      setSelectedVideoIds(next);
      return;
    }

    if (mode === 'toggle') {
      const next = new Set(baseline);
      intersectingSelection.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      setSelectedVideoIds(next);
      return;
    }

    if (mode === 'remove') {
      const next = new Set(baseline);
      intersectingSelection.forEach((id) => next.delete(id));
      setSelectedVideoIds(next);
      return;
    }

    setSelectedVideoIds(intersectingSelection);
  }, []);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || videos.length === 0) {
        return;
      }

      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      if (event.target.closest('.sidebar') || isMarqueeInteractiveTarget(event.target)) {
        return;
      }

      marqueeArmedRef.current = true;
      marqueeStartPointRef.current = { x: event.clientX, y: event.clientY };
      marqueeSelectionModeRef.current = event.altKey
        ? 'remove'
        : event.metaKey || event.ctrlKey
          ? 'add'
          : selectedIdsRef.current.size > 0
            ? 'add'
            : 'replace';
      marqueeBaselineSelectionRef.current =
        marqueeSelectionModeRef.current === 'replace' ? new Set() : new Set(selectedIdsRef.current);
      setSelectionBox(null);
    };

    document.addEventListener('pointerdown', handleGlobalPointerDown);

    return () => {
      document.removeEventListener('pointerdown', handleGlobalPointerDown);
    };
  }, [videos.length]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isMarqueeSelectingRef.current) {
        if (!marqueeArmedRef.current || !marqueeStartPointRef.current) {
          return;
        }

        const dx = event.clientX - marqueeStartPointRef.current.x;
        const dy = event.clientY - marqueeStartPointRef.current.y;

        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          return;
        }

        suppressCardClickRef.current = true;
        isMarqueeSelectingRef.current = true;
        marqueeStartRef.current = marqueeStartPointRef.current;

        if (marqueeSelectionModeRef.current === 'replace') {
          marqueeBaselineSelectionRef.current = new Set();
        }
      }

      if (!marqueeStartRef.current) {
        return;
      }

      updateMarqueeSelection(
        marqueeStartRef.current.x,
        marqueeStartRef.current.y,
        event.clientX,
        event.clientY,
      );
    };

    const handlePointerUp = () => {
      if (!isMarqueeSelectingRef.current) {
        marqueeArmedRef.current = false;
        marqueeStartPointRef.current = null;
        marqueeSelectionModeRef.current = 'replace';
        marqueeBaselineSelectionRef.current = new Set();
        return;
      }

      isMarqueeSelectingRef.current = false;
      marqueeStartRef.current = null;
      marqueeArmedRef.current = false;
      marqueeStartPointRef.current = null;
      marqueeSelectionModeRef.current = 'replace';
      marqueeBaselineSelectionRef.current = new Set();
      setSelectionBox(null);

      requestAnimationFrame(() => {
        suppressCardClickRef.current = false;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateMarqueeSelection]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      const { target } = event;

      if (isAddMenuOpen && addMenuWrapRef.current && !addMenuWrapRef.current.contains(target)) {
        setIsAddMenuOpen(false);
      }

      if (target.closest('.videoMenu') || target.closest('.videoMenuButton')) {
        return;
      }

      setMenuVideoId(null);

      if (marqueeArmedRef.current || isMarqueeSelectingRef.current) {
        return;
      }

      const clickedInsideActiveArea =
        Boolean(target.closest('.videoGridWrap')) ||
        Boolean(target.closest('.videoCardFrame')) ||
        Boolean(target.closest('.bulkActionsSticky')) ||
        Boolean(target.closest('.youtubeModal')) ||
        Boolean(target.closest('.playerDialog')) ||
        Boolean(target.closest('.dropZone'));

      if (clickedInsideActiveArea) {
        return;
      }

      clearSelection();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (menuVideoId) {
        setMenuVideoId(null);
        return;
      }

      if (isAddMenuOpen) {
        setIsAddMenuOpen(false);
        return;
      }

      if (isYoutubeModalOpen) {
        setIsYoutubeModalOpen(false);
        return;
      }

      if (playerVideoId) {
        setPlayerVideoId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearSelection, isAddMenuOpen, isYoutubeModalOpen, menuVideoId, playerVideoId]);

  const openYoutubeModal = () => {
    if (videos.length >= MAX_VIDEOS) {
      setUploadNotice('Video limit reached. Maximum 5 videos.');
      return;
    }

    setIsAddMenuOpen(false);
    setMenuVideoId(null);
    setYoutubeLinks(['']);
    setYoutubeErrors(['']);
    setIsYoutubeModalOpen(true);
  };

  const submitYoutubeLinks = () => {
    const remaining = MAX_VIDEOS - videos.length;
    if (remaining <= 0) {
      setUploadNotice('Video limit reached. Maximum 5 videos.');
      return;
    }

    const errors = youtubeLinks.map(() => '');
    const prepared: VideoCard[] = [];

    youtubeLinks.forEach((raw, index) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return;
      }

      const created = createYoutubeVideoCard(trimmed);
      if (!created) {
        errors[index] = 'Enter a valid YouTube URL';
        return;
      }

      prepared.push(created);
    });

    const nonEmptyCount = youtubeLinks.filter((value) => value.trim().length > 0).length;

    if (nonEmptyCount === 0) {
      errors[0] = 'Add at least one YouTube URL';
      setYoutubeErrors(errors);
      return;
    }

    if (errors.some(Boolean)) {
      setYoutubeErrors(errors);
      return;
    }

    if (prepared.length > remaining) {
      setUploadNotice(`You can add only ${remaining} more video${remaining === 1 ? '' : 's'}.`);
      return;
    }

    setVideos((prev) => [...prev, ...prepared]);
    setIsYoutubeModalOpen(false);
    setYoutubeLinks(['']);
    setYoutubeErrors(['']);
    setUploadNotice(null);
  };

  const activePlayerIndex = useMemo(
    () => (playerVideoId ? videos.findIndex((video) => video.id === playerVideoId) : -1),
    [playerVideoId, videos],
  );

  const activePlayerVideo = useMemo(
    () => (activePlayerIndex >= 0 ? videos[activePlayerIndex] : null),
    [activePlayerIndex, videos],
  );

  useEffect(() => {
    if (!activePlayerVideo) {
      return;
    }

    const handleArrowNavigation = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && activePlayerIndex > 0) {
        setPlayerVideoId(videos[activePlayerIndex - 1].id);
      }

      if (event.key === 'ArrowRight' && activePlayerIndex < videos.length - 1) {
        setPlayerVideoId(videos[activePlayerIndex + 1].id);
      }
    };

    document.addEventListener('keydown', handleArrowNavigation);

    return () => {
      document.removeEventListener('keydown', handleArrowNavigation);
    };
  }, [activePlayerIndex, activePlayerVideo, videos]);

  const selectedCount = selectedVideoIds.size;
  const nonEmptyYoutubeCount = youtubeLinks.filter((value) => value.trim().length > 0).length;

  const pageStyle = {
    '--brand-700': '#4b0ea3',
    '--brand-100': '#f3edfd',
    '--gray-900': '#2f2f39',
    '--gray-700': '#61616b',
    '--gray-500': '#8c8c92',
    '--gray-100': '#f1f1f2',
    '--gray-50': '#f8f8f9',
    '--danger': '#dc362e',
  } as CSSProperties;

  return (
    <main className="uploadPage" style={pageStyle}>
      <aside className="sidebar" data-no-marquee="true">
        <h2 className="sidebarTitle">CREATE NEW LISTING</h2>
        <ol className="stepList">
          <li className="stepItem done">
            <SpriteIcon name="checkmark_solid" className="stepIcon" aria-hidden="true" />
            <span>General Info</span>
          </li>
          <li className="stepItem done">
            <SpriteIcon name="checkmark_solid" className="stepIcon" aria-hidden="true" />
            <span>Upload Photos</span>
          </li>
          <li className="stepItem active">
            <span className="stepDot" aria-hidden="true" />
            <span>Upload Videos</span>
          </li>
          <li className="stepItem">
            <span className="stepDot" aria-hidden="true" />
            <span>Listing Summary</span>
          </li>
        </ol>
      </aside>

      <section className="mainSection">
        <div className="mainTopRow" data-no-marquee="true">
          <div className="listingHeatChip">
            <SpriteIcon name="snowflake_outline" className="chipIcon" aria-hidden="true" />
            <span>Listing Heat</span>
          </div>

          <button type="button" className="draftExitButton" data-no-marquee="true">
            Save to Drafts &amp; Exit
          </button>
        </div>

        <div className="contentWrap">
          <header className="headerRow">
            <div>
              <h1 className="pageTitle">Upload Video</h1>
              <p className="pageSubtitle">
                Add up to 5 videos (YouTube links or uploads). Max 200 MB per file. MP4, MOV,
                WEBM, MPEG.
              </p>
            </div>
          </header>

          <div className="toolbarRow" data-no-marquee="true">
            <p className="counterText">{videos.length}/{MAX_VIDEOS} videos added</p>

            <div className="addMenuWrap" ref={addMenuWrapRef}>
              <button
                type="button"
                className="addVideoTrigger"
                onClick={() => setIsAddMenuOpen((prev) => !prev)}
                disabled={videos.length >= MAX_VIDEOS}
                data-no-marquee="true"
              >
                <SpriteIcon name="plus_outline" className="addVideoTriggerIcon" aria-hidden="true" />
                <span>Add Video</span>
                <SpriteIcon name="chevron_down_outline" className="addVideoTriggerChevron" aria-hidden="true" />
              </button>

              {isAddMenuOpen ? (
                <div className="addVideoMenu" role="menu" aria-label="Add video options" data-no-marquee="true">
                  <button
                    type="button"
                    className="addVideoMenuItem"
                    role="menuitem"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <SpriteIcon name="upload_outline" className="addVideoMenuItemIcon" aria-hidden="true" />
                    <span>Upload from device</span>
                  </button>
                  <button
                    type="button"
                    className="addVideoMenuItem"
                    role="menuitem"
                    onClick={openYoutubeModal}
                  >
                    <SpriteIcon name="link_outline" className="addVideoMenuItemIcon" aria-hidden="true" />
                    <span>Add YouTube link</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`dropZone ${isDropActive ? 'isDragActive' : ''}`}
            onClick={handleDropZoneClick}
            onDragEnter={handleDropZoneDragEnter}
            onDragLeave={handleDropZoneDragLeave}
            onDragOver={handleDropZoneDragOver}
            onDrop={handleDropZoneDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleDropZoneClick();
              }
            }}
          >
            <div className="dropIcon" aria-hidden="true">
              <SpriteIcon name="plus_outline" className="dropIconGlyph" />
            </div>
            <p className="dropPrimary">Drag and drop videos here</p>
            <p className="dropSecondary">Max 200 MB per file. MP4, MOV, WEBM, MPEG.</p>
            <button type="button" className="dropGhostButton" data-no-marquee="true">
              <SpriteIcon name="plus_outline" className="dropGhostButtonIcon" aria-hidden="true" />
              <span>Add Video</span>
              <SpriteIcon name="chevron_down_outline" className="dropGhostButtonChevron" aria-hidden="true" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPT_VIDEO_TYPES}
            onChange={handleFileInputChange}
          />

          {uploadNotice ? <p className="noticeText">{uploadNotice}</p> : null}

          {selectedCount > 0 ? (
            <div className="bulkActionsSticky">
              <div className="bulkActionsBar">
                <span className="bulkSelectedCount">{selectedCount} selected</span>
                <button
                  type="button"
                  className="bulkDeleteButton"
                  onClick={() => deleteByIds(new Set(selectedVideoIds))}
                  data-no-marquee="true"
                >
                  <SpriteIcon name="trash_outline" className="bulkDeleteIcon" aria-hidden="true" />
                  <span>Delete selected</span>
                </button>
              </div>
            </div>
          ) : null}

          {videos.length > 0 ? (
            <div ref={videoGridRef} className={`videoGridWrap ${selectionBox ? 'isSelecting' : ''}`}>
              <div className="videoGrid">
                {videos.map((video, index) => {
                  const isSelected = selectedVideoIds.has(video.id);

                  return (
                    <article
                      key={video.id}
                      data-video-id={video.id}
                      className={`videoCardFrame ${isSelected ? 'isSelected' : ''}`}
                      onClick={(event) => {
                        const target = event.target;
                        if (!(target instanceof HTMLElement)) {
                          return;
                        }

                        if (
                          suppressCardClickRef.current ||
                          isMarqueeSelectingRef.current ||
                          marqueeArmedRef.current
                        ) {
                          return;
                        }

                        if (target.closest('.videoInteractive') || target.closest('.videoMenu')) {
                          return;
                        }

                        toggleVideoSelection(video.id);
                      }}
                    >
                      <div className="videoCard">
                        <header className="videoCardHeader">
                          <p className="videoTitle" title={video.name}>
                            {video.name}
                          </p>

                          <button
                            type="button"
                            className="videoMenuButton videoInteractive"
                            aria-label="Open video actions"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearSelection();
                              setMenuVideoId((prev) => (prev === video.id ? null : video.id));
                            }}
                            data-no-marquee="true"
                          >
                            <SpriteIcon name="dots_horizontal_outline" className="videoMenuButtonIcon" />
                          </button>
                        </header>

                        <div className="videoThumbWrap">
                          {video.source === 'upload' ? (
                            <video
                              src={video.src}
                              className="videoThumb"
                              muted
                              preload="metadata"
                              playsInline
                            />
                          ) : (
                            <img
                              src={video.thumbnail ?? video.src}
                              alt={video.name}
                              className="videoThumb"
                              draggable={false}
                            />
                          )}

                          {index === 0 ? <span className="coverBadge">Cover</span> : null}

                          <div className="videoHoverOverlay">
                            <button
                              type="button"
                              className="videoPlayButton videoInteractive"
                              onClick={(event) => {
                                event.stopPropagation();
                                clearSelection();
                                setMenuVideoId(null);
                                setPlayerVideoId(video.id);
                              }}
                              aria-label="Play video"
                              data-no-marquee="true"
                            >
                              <SpriteIcon name="play_solid" className="videoPlayIcon" />
                            </button>

                            <button
                              type="button"
                              className={`videoSelectButton videoInteractive ${isSelected ? 'isSelected' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleVideoSelection(video.id);
                              }}
                              aria-label={isSelected ? 'Deselect video' : 'Select video'}
                              data-no-marquee="true"
                            >
                              <SpriteIcon name="checkmark_solid" className="videoSelectIcon" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {menuVideoId === video.id ? (
                        <div className="videoMenu" role="menu" aria-label="Video actions" data-no-marquee="true">
                          {index > 0 ? (
                            <button
                              type="button"
                              className="videoMenuItem"
                              role="menuitem"
                              onClick={() => {
                                setMenuVideoId(null);
                                handleSetAsCover(video.id);
                              }}
                            >
                              <span>Set as cover</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="videoMenuItem isDestructive"
                            role="menuitem"
                            onClick={() => {
                              setMenuVideoId(null);
                              deleteByIds(new Set([video.id]));
                            }}
                          >
                            <SpriteIcon name="trash_outline" className="videoMenuItemIcon" aria-hidden="true" />
                            <span>Delete video</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {selectionBox ? (
        <span
          className="selectionMarquee"
          style={{
            height: `${selectionBox.height}px`,
            left: `${selectionBox.left}px`,
            top: `${selectionBox.top}px`,
            width: `${selectionBox.width}px`,
          }}
        />
      ) : null}

      {isYoutubeModalOpen ? (
        <div className="youtubeModalOverlay" onClick={() => setIsYoutubeModalOpen(false)} data-no-marquee="true">
          <div className="youtubeModal" onClick={(event) => event.stopPropagation()}>
            <header className="youtubeModalHeader">
              <div>
                <h2>Add Youtube Video</h2>
                <p>Paste Youtube Link</p>
              </div>
              <button
                type="button"
                className="modalCloseButton"
                onClick={() => setIsYoutubeModalOpen(false)}
                aria-label="Close"
              >
                <SpriteIcon name="cross_outline" className="modalCloseIcon" />
              </button>
            </header>

            <div className="youtubeFields">
              {youtubeLinks.map((link, index) => (
                <div key={`yt-link-${index}`} className="youtubeFieldRow">
                  <label htmlFor={`yt-link-${index}`} className="youtubeFieldLabel">
                    Youtube Link {index + 1}
                  </label>

                  <input
                    id={`yt-link-${index}`}
                    type="text"
                    className={`youtubeInput ${youtubeErrors[index] ? 'isError' : ''}`}
                    value={link}
                    placeholder="https://www.youtube.com/watch?v=..."
                    onChange={(event) => {
                      const value = event.target.value;
                      setYoutubeLinks((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
                      setYoutubeErrors((prev) => prev.map((item, itemIndex) => (itemIndex === index ? '' : item)));
                    }}
                  />

                  {youtubeLinks.length > 1 ? (
                    <button
                      type="button"
                      className="removeLinkButton"
                      onClick={() => {
                        setYoutubeLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                        setYoutubeErrors((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                      }}
                      aria-label="Remove link"
                    >
                      <SpriteIcon name="cross_outline" className="removeLinkIcon" />
                    </button>
                  ) : null}

                  {youtubeErrors[index] ? <p className="fieldError">{youtubeErrors[index]}</p> : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="addNewLinkButton"
              onClick={() => {
                const remaining = MAX_VIDEOS - videos.length;
                if (youtubeLinks.length >= remaining) {
                  return;
                }

                setYoutubeLinks((prev) => [...prev, '']);
                setYoutubeErrors((prev) => [...prev, '']);
              }}
              disabled={youtubeLinks.length >= MAX_VIDEOS - videos.length}
            >
              <SpriteIcon name="plus_outline" className="addNewLinkIcon" aria-hidden="true" />
              <span>Add New Link</span>
            </button>

            <footer className="youtubeModalFooter">
              <button
                type="button"
                className="modalSecondaryButton"
                onClick={() => setIsYoutubeModalOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="modalPrimaryButton" onClick={submitYoutubeLinks}>
                {nonEmptyYoutubeCount > 1 ? `Add ${nonEmptyYoutubeCount} Videos` : 'Add Video'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {activePlayerVideo ? (
        <div className="playerOverlay" onClick={() => setPlayerVideoId(null)} data-no-marquee="true">
          <div className="playerDialog" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="playerCloseButton"
              onClick={() => setPlayerVideoId(null)}
              aria-label="Close player"
            >
              <SpriteIcon name="cross_outline" className="playerCloseIcon" />
            </button>

            {activePlayerIndex > 0 ? (
              <button
                type="button"
                className="playerNavButton isLeft"
                onClick={() => setPlayerVideoId(videos[activePlayerIndex - 1].id)}
                aria-label="Previous video"
              >
                <SpriteIcon name="arrow_left_outline" className="playerNavIcon" />
              </button>
            ) : null}

            {activePlayerIndex < videos.length - 1 ? (
              <button
                type="button"
                className="playerNavButton isRight"
                onClick={() => setPlayerVideoId(videos[activePlayerIndex + 1].id)}
                aria-label="Next video"
              >
                <SpriteIcon name="arrow_right_outline" className="playerNavIcon" />
              </button>
            ) : null}

            <div className="playerMediaWrap">
              {activePlayerVideo.source === 'upload' ? (
                <video
                  src={activePlayerVideo.src}
                  controls
                  autoPlay
                  playsInline
                  className="playerVideo"
                />
              ) : (
                <iframe
                  src={activePlayerVideo.embedUrl}
                  title={activePlayerVideo.name}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="playerIframe"
                />
              )}
            </div>

            <div className="playerFooter">
              <p className="playerTitle">{activePlayerVideo.name}</p>
              <p className="playerCounter">
                {activePlayerIndex + 1}/{videos.length}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
