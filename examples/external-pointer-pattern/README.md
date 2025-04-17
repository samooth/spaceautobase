# External Pointer Pattern

The external pointer pattern has a writer append a pointer to large amounts of data stored in another data structure, usually one base on a spacecore.

## Motivation

When using an spaceautobase that need to synchronize large amounts of data, if the data is appended by writers and used to create the view, the spaceautobase can quickly grow in size due to the writer data being copied into the view. This can slow down indexers by requiring them to processing large amounts of data.

## Solution

To avoid this, writers can append a block which includes a pointer to find the data outside of the spaceautobase. This way data isn't duplicated between the writer and the view.

## Example

A simple example is a multiwriter blob store using [`spaceblobs`](https://github.com/holepunchto/spaceblobs) to create a `BlobBase`. The `BlobBase`'s `view` is a [Spacebee](https://github.com/holepunchto/spacebee) with filenames as `key`s and a pointer for the blob contents (`{ blobKey, id }`) as the `value`s.

Adding a file to the `BlobBase` (`blobBase.put(filename, blob)`) first `.put()`s the blob into a local spaceblobs instance and then appends a block with:

```js
{
  op: 'put',
  key: filename,
  value: {
    blobKey: this.localBlobs.key,
    id // output from await this.localBlobs.put(blob)
  }
}
```

To retrieve the blobs, a peer can lookup the pointer using the filename to `view.get(filename)` and creating a Spaceblob instance based on the pointer to get the blob from.

This means the peer need to replicate the spaceblobs instance as well so that when peers access the `filename` they can request the blob. A full solution would manage the spaceblobs much like how SpaceAutobase manages writers keeping only the relevant spaceblobs open and closing them as needed.

With the pointer a 100MB blob is only stored in the spaceblobs's core of the writer.

Full code in [`./blob-base.mjs`](./blob-base.mjs).

## Run

```console
npm i
bare blob-base.mjs
```
